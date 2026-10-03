/* ============================================================
   IVSCL & IVSL 联合赛季 · 后端 API
   Cloudflare Workers + D1 (激活码读取本地 JSON 版)
============================================================ */
import inviteCodesData from '../data/invite-codes.json';

/* 管理员数据看板使用的表白名单。表名和列名始终来自这里，避免把前端输入拼进 SQL。 */
const DASHBOARD_TABLES = {
  users: { label: '用户', primaryKey: 'id', columns: ['id', 'username', 'phone', 'role', 'created_at'], writable: false },
  invite_codes: { label: '激活码', primaryKey: 'code', columns: ['code', 'role', 'label', 'used', 'used_by'], writable: false },
  announcements: { label: '公告', primaryKey: 'id', columns: ['id', 'tag', 'tag_class', 'time', 'text', 'is_pinned', 'created_at'], writable: true },
  teams: { label: '队伍', primaryKey: 'id', columns: ['id', 'name', 'short', 'logo', 'created_at'], writable: true },
  rooms: { label: '比赛房间', primaryKey: 'id', columns: ['id', 'code', 'password', 'title', 'creator', 'created_at', 'start_time', 'team_a', 'team_b', 'home'], writable: true },
  schedule: { label: '赛程', primaryKey: 'id', columns: ['id', 'title', 'matches', 'created_at'], writable: true },
  team_profiles: { label: '队长学校绑定', primaryKey: 'phone', columns: ['phone', 'school', 'created_at'], writable: true },
  players: { label: '选手名单', primaryKey: 'id', columns: ['id', 'school', 'name', 'uid', 'position', 'is_coach', 'created_at'], writable: true },
  match_appointments: {
    label: '约赛记录',
    primaryKey: 'id',
    columns: ['id', 'schedule_id', 'match_index', 'team_a', 'team_b', 'start_time', 'notes', 'booked_by_school', 'is_finished', 'score_a', 'score_b', 'rounds', 'created_by_phone', 'created_by_name', 'created_at'],
    writable: true
  },
  match_signups: { label: '工作人员报名', primaryKey: 'id', columns: ['id', 'appointment_id', 'role', 'user_phone', 'username', 'created_at'], writable: true }
};

function dashboardTablePayload(table, rows) {
  const config = DASHBOARD_TABLES[table];
  return {
    name: table,
    label: config.label,
    primaryKey: config.primaryKey,
    columns: config.columns,
    writable: config.writable,
    rows
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const corsHeaders = {
      'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      /* ============ 健康检查 ============ */
      if (path === '/api/health' && method === 'GET') {
        return json({ ok: true, region: request.cf?.colo || 'unknown' }, corsHeaders);
      }

      /* ============================================================
         账号系统
      ============================================================ */

      if (path === '/api/auth/register' && method === 'POST') {
        const body = await request.json();
        const { phone, username, password, inviteCode } = body;

        if (!/^1\d{10}$/.test(phone || '')) {
          return json({ error: '手机号格式错误' }, corsHeaders, 400);
        }
        if (!username || username.length > 16) {
          return json({ error: '账号名称无效（1-16 字符）' }, corsHeaders, 400);
        }
        if (!password || password.length < 6) {
          return json({ error: '密码至少 6 位' }, corsHeaders, 400);
        }
        if (!inviteCode) {
          return json({ error: '请输入激活码' }, corsHeaders, 400);
        }

        const inputCode = inviteCode.trim().toUpperCase();
        const code = inviteCodesData.codes.find(c => c.code.toUpperCase() === inputCode);

        if (!code) return json({ error: '激活码无效' }, corsHeaders, 400);

        const exists = await env.DB.prepare(
          'SELECT id FROM users WHERE phone = ?'
        ).bind(phone).first();
        if (exists) return json({ error: '该手机号已注册' }, corsHeaders, 400);

        const nameTaken = await env.DB.prepare(
          'SELECT id FROM users WHERE username = ?'
        ).bind(username).first();
        if (nameTaken) return json({ error: '该名称已被使用' }, corsHeaders, 400);

        const hash = await sha256(password);
        const now = new Date().toISOString();

        await env.DB.prepare(
          'INSERT INTO users (phone, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)'
        ).bind(phone, username, hash, code.role, now).run();

        const user = { phone, username, role: code.role };
        const token = await signToken(user, env);
        return json({ token, user }, corsHeaders);
      }

      if (path === '/api/auth/login' && method === 'POST') {
        const { phone, password } = await request.json();
        if (!phone || !password) {
          return json({ error: '请输入手机号和密码' }, corsHeaders, 400);
        }

        const user = await env.DB.prepare(
          'SELECT * FROM users WHERE phone = ?'
        ).bind(phone).first();

        if (!user) return json({ error: '账号不存在' }, corsHeaders, 401);

        const hash = await sha256(password);
        if (hash !== user.password_hash) {
          return json({ error: '密码错误' }, corsHeaders, 401);
        }

        const payload = { phone: user.phone, username: user.username, role: user.role };
        const token = await signToken(payload, env);
        return json({ token, user: payload }, corsHeaders);
      }

      if (path === '/api/auth/me' && method === 'GET') {
        const user = await verifyToken(request, env);
        if (!user) return json({ error: '未登录' }, corsHeaders, 401);
        return json({ user }, corsHeaders);
      }

      /* ============================================================
         公告栏
      ============================================================ */

      if (path === '/api/staff' && method === 'GET') {
        const result = await env.DB.prepare(
          "SELECT username, role FROM users WHERE role IN ('judge', 'commentator') ORDER BY role, username"
        ).all();
        return json({ staff: result.results || [] }, corsHeaders);
      }

            if (path === '/api/announcements') {
        if (method === 'GET') {
          const result = await env.DB.prepare(
            'SELECT * FROM announcements ORDER BY is_pinned DESC, id DESC'
          ).all();
          return json({ announcements: result.results || [] }, corsHeaders);
        }

        if (method === 'POST') {
          const user = await verifyToken(request, env);
          if (!user || user.role !== 'admin') {
            return json({ error: '无权访问' }, corsHeaders, 403);
          }

          const { tag, tagClass, time, text, isPinned } = await request.json();
          if (!text) return json({ error: '正文不能为空' }, corsHeaders, 400);

          const info = await env.DB.prepare(
            'INSERT INTO announcements (tag, tag_class, time, text, is_pinned, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          ).bind(
            tag || '动态',
            tagClass || 'tag--event',
            time || '',
            text,
            isPinned ? 1 : 0,
            new Date().toISOString()
          ).run();

          return json({ id: info.meta.last_row_id }, corsHeaders);
        }
      }

      /* 公告置顶切换 */
      const annPinPath = path.match(/^\/api\/announcements\/(\d+)\/pin$/);
      if (annPinPath && method === 'PATCH') {
        const user = await verifyToken(request, env);
        if (!user || user.role !== 'admin') {
          return json({ error: '无权访问' }, corsHeaders, 403);
        }
        const body = await request.json();
        const update = await env.DB.prepare(
          'UPDATE announcements SET is_pinned = ? WHERE id = ?'
        ).bind(body.is_pinned ? 1 : 0, Number(annPinPath[1])).run();
        if (!update.meta.changes) return json({ error: '公告不存在' }, corsHeaders, 404);
        return json({ ok: true, is_pinned: !!body.is_pinned }, corsHeaders);
      }

      if (path.startsWith('/api/announcements/') && method === 'DELETE') {
        const user = await verifyToken(request, env);
        if (!user || user.role !== 'admin') {
          return json({ error: '无权访问' }, corsHeaders, 403);
        }
        const id = path.split('/').pop();
        await env.DB.prepare('DELETE FROM announcements WHERE id = ?').bind(id).run();
        return json({ ok: true }, corsHeaders);
      }

      /* ============================================================
         队伍管理
      ============================================================ */

      if (path === '/api/teams') {
        if (method === 'GET') {
          const includeBasicFieldsOnly = url.searchParams.get('basic') === '1';
          const result = await env.DB.prepare(
            includeBasicFieldsOnly
              ? 'SELECT id, name, short, created_at FROM teams ORDER BY id ASC'
              : 'SELECT id, name, short, logo, created_at FROM teams ORDER BY id ASC'
          ).all();
          return json({ teams: result.results || [] }, corsHeaders);
        }

        if (method === 'POST') {
          const user = await verifyToken(request, env);
          if (!user || user.role !== 'admin') {
            return json({ error: '无权访问' }, corsHeaders, 403);
          }

          const { name, short, logo } = await request.json();
          if (!name || !short) {
            return json({ error: '队伍名称与简称不能为空' }, corsHeaders, 400);
          }

          const dup = await env.DB.prepare(
            'SELECT id FROM teams WHERE short = ?'
          ).bind(short).first();
          if (dup) return json({ error: '该简称已存在' }, corsHeaders, 400);

          let logoValue = null;
          if (logo) {
            if (typeof logo !== 'string' || !logo.startsWith('data:image/')) {
              return json({ error: '图片格式错误' }, corsHeaders, 400);
            }
            if (logo.length > 1.5 * 1024 * 1024) {
              return json({ error: '图片过大，请压缩后重试' }, corsHeaders, 400);
            }
            logoValue = logo;
          }

          const now = new Date().toISOString();
          const info = await env.DB.prepare(
            'INSERT INTO teams (name, short, logo, created_at) VALUES (?, ?, ?, ?)'
          ).bind(name, short, logoValue, now).run();

          return json({
            id: info.meta.last_row_id,
            team: {
              id: info.meta.last_row_id,
              name,
              short,
              logo: logoValue,
              created_at: now
            }
          }, corsHeaders);
        }
      }

      /* ============================================================
         队长创建/编辑自己的队伍（含上传 logo 与自动绑定）
      ============================================================ */
      if (path === '/api/team/create-school' && method === 'POST') {
        const user = await verifyToken(request, env);
        if (!user || (user.role !== 'team' && user.role !== 'admin')) {
          return json({ error: '仅队长或管理员可以创建队伍' }, corsHeaders, 403);
        }
        const body = await request.json();
        const cleanShort = String(body.short || '').trim().toLowerCase();
        const cleanName  = String(body.name  || '').trim();
        if (!cleanShort) return json({ error: '学校简称不能为空' }, corsHeaders, 400);
        if (!cleanName)  return json({ error: '学校全称不能为空' }, corsHeaders, 400);
        if (!/^[a-z0-9_-]{1,20}$/.test(cleanShort)) {
          return json({ error: '简称只能包含字母、数字、下划线、连字符（1-20 位）' }, corsHeaders, 400);
        }
        if (cleanName.length > 30) {
          return json({ error: '学校全称最长 30 个字符' }, corsHeaders, 400);
        }

        // 校验 logo
        let logoValue = null;
        if (body.logo) {
          if (typeof body.logo !== 'string' || !body.logo.startsWith('data:image/')) {
            return json({ error: '图片格式错误' }, corsHeaders, 400);
          }
          if (body.logo.length > 1.5 * 1024 * 1024) {
            return json({ error: '图片过大，请压缩后重试' }, corsHeaders, 400);
          }
          logoValue = body.logo;
        }

        const existing = await env.DB.prepare(
          'SELECT id, short FROM teams WHERE short = ?'
        ).bind(cleanShort).first();

        // team 角色已绑定到别的队伍 → 只能编辑自己的
        if (user.role === 'team') {
          const profile = await env.DB.prepare(
            'SELECT school FROM team_profiles WHERE phone = ?'
          ).bind(user.phone).first();

          if (profile?.school && profile.school !== cleanShort) {
            const targetTeam = await env.DB.prepare(
              'SELECT id FROM teams WHERE short = ?'
            ).bind(profile.school).first();
            if (!targetTeam) {
              return json({ error: '原绑定学校数据异常，请联系管理员' }, corsHeaders, 500);
            }
            if (logoValue) {
              await env.DB.prepare('UPDATE teams SET name = ?, logo = ? WHERE id = ?')
                .bind(cleanName, logoValue, targetTeam.id).run();
            } else {
              await env.DB.prepare('UPDATE teams SET name = ? WHERE id = ?')
                .bind(cleanName, targetTeam.id).run();
            }
            return json({ ok: true, school: profile.school, action: 'updated' }, corsHeaders);
          }
        }

        if (existing) {
          if (user.role !== 'admin') {
            return json({ error: '该简称已被其他队伍占用' }, corsHeaders, 400);
          }
          if (logoValue) {
            await env.DB.prepare('UPDATE teams SET name = ?, logo = ? WHERE id = ?')
              .bind(cleanName, logoValue, existing.id).run();
          } else {
            await env.DB.prepare('UPDATE teams SET name = ? WHERE id = ?')
              .bind(cleanName, existing.id).run();
          }
        } else {
          await env.DB.prepare(
            'INSERT INTO teams (name, short, logo, created_at) VALUES (?, ?, ?, ?)'
          ).bind(cleanName, cleanShort, logoValue, new Date().toISOString()).run();
        }

        // team 角色自动绑定到自己创建的队伍
        if (user.role === 'team') {
          await env.DB.prepare(
            'INSERT INTO team_profiles (phone, school, created_at) VALUES (?, ?, ?) ' +
            'ON CONFLICT(phone) DO UPDATE SET school = excluded.school'
          ).bind(user.phone, cleanShort, new Date().toISOString()).run();
        }

        return json({ ok: true, school: cleanShort, action: existing ? 'updated' : 'created' }, corsHeaders);
      }

      if (path === '/api/team-logos' && method === 'GET') {
        const result = await env.DB.prepare(
          'SELECT short, logo FROM teams WHERE logo IS NOT NULL AND logo != ? ORDER BY id ASC'
        ).bind('').all();
        return json({ teams: result.results || [] }, corsHeaders);
      }

      if (path.startsWith('/api/teams/') && method === 'DELETE') {
        const user = await verifyToken(request, env);
        if (!user || user.role !== 'admin') {
          return json({ error: '无权访问' }, corsHeaders, 403);
        }
        const id = path.split('/').pop();
        const t = await env.DB.prepare('SELECT short FROM teams WHERE id = ?').bind(id).first();
        if (t) {
          await env.DB.prepare('DELETE FROM players WHERE school = ?').bind(t.short).run();
          await env.DB.prepare('DELETE FROM team_profiles WHERE school = ?').bind(t.short).run();
        }
        await env.DB.prepare('DELETE FROM teams WHERE id = ?').bind(id).run();
        return json({ ok: true }, corsHeaders);
      }

      /* ============================================================
         比赛房间
      ============================================================ */

      if (path === '/api/rooms') {
        if (method === 'GET') {
          const user = await verifyToken(request, env);
          if (!user || (user.role !== 'admin' && user.role !== 'judge')) {
            return json({ error: '无权访问' }, corsHeaders, 403);
          }
          const result = await env.DB.prepare(
            'SELECT * FROM rooms ORDER BY id DESC'
          ).all();
          return json({ rooms: result.results || [] }, corsHeaders);
        }

        if (method === 'POST') {
          const user = await verifyToken(request, env);
          if (!user || (user.role !== 'admin' && user.role !== 'judge')) {
            return json({ error: '无权访问' }, corsHeaders, 403);
          }

          const { code, password, title, start_time, team_a, team_b, home } = await request.json();
          if (!code) return json({ error: '房间号不能为空' }, corsHeaders, 400);

          let teamA = null, teamB = null;
          if (team_a && team_b) {
            const rowA = await env.DB.prepare('SELECT short FROM teams WHERE short = ?').bind(team_a).first();
            const rowB = await env.DB.prepare('SELECT short FROM teams WHERE short = ?').bind(team_b).first();
            if (!rowA || !rowB) return json({ error: '对战队伍不存在，请选择已登记的学校' }, corsHeaders, 400);
            if (team_a === team_b) return json({ error: '对战双方不能是同一支队伍' }, corsHeaders, 400);
            teamA = team_a; teamB = team_b;
          }

          let startTimeIso = '';
          if (start_time) {
            const parsed = parseBeijingTime(start_time);
            startTimeIso = isNaN(parsed.getTime()) ? String(start_time) : parsed.toISOString();
          }

          const info = await env.DB.prepare(
            'INSERT INTO rooms (code, password, title, creator, created_at, start_time, team_a, team_b, home) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(
            code,
            password || '',
            title || '',
            user.username || '匿名',
            new Date().toISOString(),
            startTimeIso,
            teamA,
            teamB,
            home || ''
          ).run();

          return json({ id: info.meta.last_row_id }, corsHeaders);
        }
      }

      if (path.startsWith('/api/rooms/') && method === 'DELETE') {
        const user = await verifyToken(request, env);
        if (!user || (user.role !== 'admin' && user.role !== 'judge')) {
          return json({ error: '无权访问' }, corsHeaders, 403);
        }
        const id = path.split('/').pop();
        await env.DB.prepare('DELETE FROM rooms WHERE id = ?').bind(id).run();
        return json({ ok: true }, corsHeaders);
      }

      /* ============================================================
         赛事抽签
      ============================================================ */

      if (path === '/api/draws') {
        if (method === 'GET') {
          const result = await env.DB.prepare(
            'SELECT * FROM draws ORDER BY id DESC LIMIT 1'
          ).first();
          return json({ draw: result || null }, corsHeaders);
        }

        if (method === 'POST') {
          const user = await verifyToken(request, env);
          if (!user || user.role !== 'admin') {
            return json({ error: '无权访问' }, corsHeaders, 403);
          }

          const teamsResult = await env.DB.prepare(
            'SELECT name FROM teams ORDER BY id ASC'
          ).all();
          const teams = teamsResult.results || [];

          if (teams.length < 2) {
            return json({ error: '队伍数量不足，无法抽签' }, corsHeaders, 400);
          }

          const names = teams.map(t => t.name).sort(() => Math.random() - 0.5);
          const pairs = [];
          for (let i = 0; i < names.length; i += 2) {
            pairs.push({ a: names[i] || '', b: names[i + 1] || null });
          }

          const info = await env.DB.prepare(
            'INSERT INTO draws (pairs, created_at) VALUES (?, ?)'
          ).bind(JSON.stringify(pairs), new Date().toISOString()).run();

          return json({ id: info.meta.last_row_id, pairs }, corsHeaders);
        }

        if (method === 'DELETE') {
          const user = await verifyToken(request, env);
          if (!user || user.role !== 'admin') {
            return json({ error: '无权访问' }, corsHeaders, 403);
          }
          await env.DB.prepare('DELETE FROM draws').run();
          return json({ ok: true }, corsHeaders);
        }
      }

      /* ============================================================
         赛事赛程
      ============================================================ */

            if (path === '/api/schedule') {
        /* ---------- GET ---------- */
        if (method === 'GET') {
          const result = await env.DB.prepare(
            'SELECT * FROM schedule ORDER BY id DESC LIMIT 1'
          ).first();
          if (!result) return json({ schedule: null }, corsHeaders);

          let payload = null;
          try { payload = JSON.parse(result.matches); } catch (e) {}

          /* payload 可能是：
             - 数组 [{a,b}, ...]                    → 旧数据
             - 对象 {type, rounds: [...]}            → 新数据
          */
          let type = 'single';
          if (payload && !Array.isArray(payload) && payload.type) {
            type = payload.type;
          }

          return json({
            schedule: {
              id: result.id,
              title: result.title || '',
              type,
              matches: payload,
              created_at: result.created_at
            }
          }, corsHeaders);
        }

        /* ---------- POST ---------- */
        if (method === 'POST') {
          const user = await verifyToken(request, env);
          if (!user || user.role !== 'admin') {
            return json({ error: '无权访问' }, corsHeaders, 403);
          }

          const body = await request.json();
          const { title, type, matches } = body;

          if (!matches) return json({ error: '赛程数据不能为空' }, corsHeaders, 400);

          let payload;

          /* 情况1：管理员上传的结构化数据 { type, rounds: [...] } */
          if (matches && typeof matches === 'object' && !Array.isArray(matches) && Array.isArray(matches.rounds)) {
            payload = {
              type: matches.type || type || 'single',
              rounds: matches.rounds
            };
          }
          /* 情况2：扁平数组（可带 round 字段） */
          else if (Array.isArray(matches)) {
            const hasRound = matches.some(m => m && typeof m === 'object' && m.round != null);

            if (!hasRound) {
              /* 全部当作第一轮 */
              const pairs = matches.map(m => {
                if (Array.isArray(m)) return { a: String(m[0] || '').trim(), b: String(m[1] || '').trim() };
                return {
                  a: String(m?.a ?? m?.home ?? '').trim(),
                  b: String(m?.b ?? m?.away ?? '').trim()
                };
              }).filter(p => p.a || p.b);

              if (!pairs.length) return json({ error: '没有解析到任何对阵' }, corsHeaders, 400);

              payload = {
                type: 'single',
                rounds: [{
                  index: 1,
                  name: `${pairs.length * 2} 进 ${pairs.length}`,
                  fromCount: pairs.length * 2,
                  toCount: pairs.length,
                  bracket: 'main',
                  matches: pairs
                }]
              };
            } else {
              /* 按 round 字段分组 */
              const grouped = new Map();
              matches.forEach(m => {
                const r = Number(m.round) || 1;
                if (!grouped.has(r)) grouped.set(r, []);
                grouped.get(r).push({
                  a: String(m.a || '').trim(),
                  b: String(m.b || '').trim()
                });
              });
              const sortedKeys = [...grouped.keys()].sort((a, b) => a - b);
              const rounds = sortedKeys.map((key, i) => {
                const list = grouped.get(key);
                return {
                  index: i + 1,
                  name: `${list.length * 2} 进 ${list.length}`,
                  fromCount: list.length * 2,
                  toCount: list.length,
                  bracket: 'main',
                  matches: list
                };
              });
              payload = { type: type || 'single', rounds };
            }
          }
          else {
            return json({ error: '赛程数据格式错误' }, corsHeaders, 400);
          }

          /* 校验：每场比赛必须 a、b 齐全 */
          for (const r of payload.rounds) {
            if (!Array.isArray(r.matches)) {
              return json({ error: '第 ' + r.index + ' 轮 matches 不是数组' }, corsHeaders, 400);
            }
            for (const m of r.matches) {
              if (!m.a || !m.b) {
                return json({ error: `第 ${r.index} 轮存在不完整对阵（缺 a 或 b）` }, corsHeaders, 400);
              }
            }
          }

          const now = new Date().toISOString();
          const info = await env.DB.prepare(
            'INSERT INTO schedule (title, matches, created_at) VALUES (?, ?, ?)'
          ).bind(
            title || '赛程',
            JSON.stringify(payload),
            now
          ).run();

          return json({
            id: info.meta.last_row_id,
            ok: true,
            type: payload.type,
            roundsCount: payload.rounds.length
          }, corsHeaders);
        }

        /* ---------- DELETE ---------- */
        if (method === 'DELETE') {
          const user = await verifyToken(request, env);
          if (!user || user.role !== 'admin') {
            return json({ error: '无权访问' }, corsHeaders, 403);
          }
          await env.DB.prepare('DELETE FROM schedule').run();
          return json({ ok: true }, corsHeaders);
        }
      }

      /* ============================================================
         约赛 / 结果
      ============================================================ */

      if (path === '/api/match-appointments' && method === 'GET') {
        const scheduleId = Number(url.searchParams.get('schedule_id'));
        if (!Number.isInteger(scheduleId) || scheduleId < 1) {
          return json({ error: '赛程编号无效' }, corsHeaders, 400);
        }
        const result = await env.DB.prepare(
          'SELECT * FROM match_appointments WHERE schedule_id = ? ORDER BY match_index'
        ).bind(scheduleId).all();
        const appointments = result.results || [];
        if (!appointments.length) return json({ appointments: [] }, corsHeaders);

        const ids = appointments.map(a => a.id);
        const placeholders = ids.map(() => '?').join(',');
        const viewer = await verifyToken(request, env);
        const signupResult = await env.DB.prepare(
          `SELECT appointment_id, role, user_phone, username FROM match_signups WHERE appointment_id IN (${placeholders}) ORDER BY created_at`
        ).bind(...ids).all();
        const signupsByAppointment = {};
        for (const signup of signupResult.results || []) {
          (signupsByAppointment[signup.appointment_id] ||= []).push({
            role: signup.role,
            username: signup.username,
            is_mine: !!viewer && signup.user_phone === viewer.phone &&
              (viewer.role === 'admin' || signup.role === viewer.role)
          });
        }
        return json({ appointments: appointments.map(a => {
          const { created_by_phone, ...publicAppointment } = a;
          return { ...publicAppointment, signups: signupsByAppointment[a.id] || [] };
        }) }, corsHeaders);
      }

      if (path === '/api/match-appointments' && method === 'POST') {
        const user = await verifyToken(request, env);
        if (!user || !['team', 'admin'].includes(user.role)) {
          return json({ error: '仅队长或管理员可以约赛' }, corsHeaders, 403);
        }
        const profile = user.role === 'team'
          ? await env.DB.prepare('SELECT school FROM team_profiles WHERE phone = ?').bind(user.phone).first()
          : null;
        if (user.role === 'team' && !profile?.school) return json({ error: '请先绑定自己的学校' }, corsHeaders, 403);
        const body = await request.json();
        const scheduleId = Number(body.schedule_id);
        const matchIndex = Number(body.match_index);
        const startTime = parseBeijingTime(body.start_time);
        if (!Number.isInteger(scheduleId) || scheduleId < 1 || !Number.isInteger(matchIndex) || matchIndex < 0 || Number.isNaN(startTime.getTime())) {
          return json({ error: '请选择有效对阵并填写比赛时间' }, corsHeaders, 400);
        }
        const scheduleRow = await env.DB.prepare('SELECT id, matches FROM schedule WHERE id = ?').bind(scheduleId).first();
        if (!scheduleRow) return json({ error: '赛程不存在或已更新' }, corsHeaders, 404);
        let matches;
        try { matches = JSON.parse(scheduleRow.matches); } catch { matches = []; }
        const match = matches[matchIndex];
        const teamA = match && String(match.a || '').trim();
        const teamB = match && String(match.b || '').trim();
        if (!teamA || !teamB || teamA === teamB) return json({ error: '该场对阵不完整，不能安排比赛' }, corsHeaders, 400);
        const bookedBySchool = user.role === 'admin' ? String(body.booked_by_school || teamA).trim() : profile.school;
        if (![teamA, teamB].includes(bookedBySchool)) {
          return json({ error: '关联学校必须属于当前对阵' }, corsHeaders, 400);
        }
        if (user.role === 'team' && teamA !== profile.school && teamB !== profile.school) {
          return json({ error: '只能为自己绑定学校所在的对阵约赛' }, corsHeaders, 403);
        }
        const validTeams = await env.DB.prepare('SELECT short FROM teams WHERE short IN (?, ?)').bind(teamA, teamB).all();
        if ((validTeams.results || []).length !== 2) return json({ error: '对阵队伍不在已登记队伍中' }, corsHeaders, 400);

        const existing = await env.DB.prepare(
          'SELECT id FROM match_appointments WHERE schedule_id = ? AND match_index = ?'
        ).bind(scheduleId, matchIndex).first();
        const now = new Date().toISOString();
        const notes = String(body.notes || '').trim().slice(0, 500);
        if (existing) {
          await env.DB.prepare(
            'UPDATE match_appointments SET start_time = ?, notes = ?, booked_by_school = ?, created_by_phone = ?, created_by_name = ?, created_at = ? WHERE id = ?'
          ).bind(startTime.toISOString(), notes, bookedBySchool, user.phone, user.username || (user.role === 'admin' ? '管理员' : '队长'), now, existing.id).run();
        } else {
          await env.DB.prepare(
            'INSERT INTO match_appointments (schedule_id, match_index, team_a, team_b, start_time, notes, booked_by_school, created_by_phone, created_by_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(scheduleId, matchIndex, teamA, teamB, startTime.toISOString(), notes, bookedBySchool, user.phone, user.username || (user.role === 'admin' ? '管理员' : '队长'), now).run();
        }
        return json({ ok: true }, corsHeaders);
      }

      const statusPath = path.match(/^\/api\/match-appointments\/(\d+)\/status$/);
      if (statusPath && method === 'PATCH') {
        const user = await verifyToken(request, env);
        if (!user || !['judge', 'admin'].includes(user.role)) {
          return json({ error: '仅裁判可以更新完赛状态' }, corsHeaders, 403);
        }
        const body = await request.json();
        if (typeof body.is_finished !== 'boolean') return json({ error: '完赛状态无效' }, corsHeaders, 400);

        const appointmentId = Number(statusPath[1]);

        if (!body.is_finished) {
          const update = await env.DB.prepare(
            'UPDATE match_appointments SET is_finished = 0, score_a = NULL, score_b = NULL, rounds = NULL WHERE id = ?'
          ).bind(appointmentId).run();
          if (!update.meta.changes) return json({ error: '比赛安排不存在' }, corsHeaders, 404);
          return json({ ok: true, is_finished: false }, corsHeaders);
        }

        const roundsInput = body.rounds;
        if (!Array.isArray(roundsInput) || !roundsInput.length) {
          return json({ error: '请至少提交一局小比分' }, corsHeaders, 400);
        }
        if (roundsInput.length > 9) {
          return json({ error: '局数过多（最多 9 局）' }, corsHeaders, 400);
        }

        const rounds = [];
        let totalA = 0, totalB = 0;
        for (let i = 0; i < roundsInput.length; i++) {
          const r = roundsInput[i];
          if (!r || !r.first || !r.second) {
            return json({ error: `第 ${i + 1} 局缺少上半场或下半场` }, corsHeaders, 400);
          }
          const fa = Number(r.first.a), fb = Number(r.first.b);
          const sa = Number(r.second.a), sb = Number(r.second.b);
          if (![fa, fb, sa, sb].every(n => Number.isInteger(n) && n >= 0 && n <= 99)) {
            return json({ error: `第 ${i + 1} 局的比分需为 0-99 的整数` }, corsHeaders, 400);
          }
          rounds.push({ first: { a: fa, b: fb }, second: { a: sa, b: sb } });
          totalA += fa + sa;
          totalB += fb + sb;
        }

        const update = await env.DB.prepare(
          'UPDATE match_appointments SET is_finished = 1, score_a = ?, score_b = ?, rounds = ? WHERE id = ?'
        ).bind(totalA, totalB, JSON.stringify(rounds), appointmentId).run();
        if (!update.meta.changes) return json({ error: '比赛安排不存在' }, corsHeaders, 404);
        return json({ ok: true, is_finished: true, score_a: totalA, score_b: totalB, rounds }, corsHeaders);
      }

      const signupPath = path.match(/^\/api\/match-appointments\/(\d+)\/signup$/);
      if (signupPath && (method === 'POST' || method === 'DELETE')) {
        const user = await verifyToken(request, env);
        if (!user || !['judge', 'commentator', 'admin'].includes(user.role)) {
          return json({ error: '请使用裁判、解说或管理员账号报名' }, corsHeaders, 403);
        }
        const appointmentId = Number(signupPath[1]);
        const body = await request.json().catch(() => ({}));
        const signupRole = user.role === 'admin' ? body.role : user.role;
        if (!['judge', 'commentator'].includes(signupRole)) {
          return json({ error: '报名身份无效' }, corsHeaders, 400);
        }
        if (method === 'POST') {
          const appointment = await env.DB.prepare('SELECT id FROM match_appointments WHERE id = ?').bind(appointmentId).first();
          if (!appointment) return json({ error: '比赛安排不存在' }, corsHeaders, 404);
          try {
            await env.DB.prepare(
              'INSERT INTO match_signups (appointment_id, role, user_phone, username, created_at) VALUES (?, ?, ?, ?, ?)'
            ).bind(appointmentId, signupRole, user.phone, user.username || '', new Date().toISOString()).run();
          } catch (err) {
            if (String(err.message || '').toLowerCase().includes('unique')) {
              return json({ error: '你已经报名该场比赛' }, corsHeaders, 409);
            }
            throw err;
          }
          return json({ ok: true }, corsHeaders);
        }
        await env.DB.prepare(
          'DELETE FROM match_signups WHERE appointment_id = ? AND role = ? AND user_phone = ?'
        ).bind(appointmentId, signupRole, user.phone).run();
        return json({ ok: true }, corsHeaders);
      }

      if (path === '/api/team/school' && method === 'POST') {
        const user = await verifyToken(request, env);
        if (!user || (user.role !== 'team' && user.role !== 'admin')) {
          return json({ error: '无权访问' }, corsHeaders, 403);
        }
        const { school } = await request.json();
        if (!school) return json({ error: '请选择学校' }, corsHeaders, 400);

        const team = await env.DB.prepare('SELECT short FROM teams WHERE short = ?')
          .bind(String(school).trim()).first();
        if (!team) return json({ error: '该学校不存在' }, corsHeaders, 400);

        await env.DB.prepare(
          'INSERT INTO team_profiles (phone, school, created_at) VALUES (?, ?, ?) ' +
          'ON CONFLICT(phone) DO UPDATE SET school = excluded.school'
        ).bind(user.phone, team.short, new Date().toISOString()).run();

        return json({ ok: true, school: team.short }, corsHeaders);
      }

      if (path === '/api/team/school' && method === 'GET') {
        const user = await verifyToken(request, env);
        if (!user || (user.role !== 'team' && user.role !== 'admin')) {
          return json({ error: '无权访问' }, corsHeaders, 403);
        }
        if (user.role === 'admin') {
          const url2 = new URL(request.url);
          const phone = url2.searchParams.get('phone');
          const school = url2.searchParams.get('school');
          if (school) {
            const p = await env.DB.prepare('SELECT * FROM team_profiles WHERE school = ?').bind(school).first();
            return json({ profile: p || null }, corsHeaders);
          }
          if (phone) {
            const p = await env.DB.prepare('SELECT * FROM team_profiles WHERE phone = ?').bind(phone).first();
            return json({ profile: p || null }, corsHeaders);
          }
          const all = await env.DB.prepare('SELECT * FROM team_profiles ORDER BY school').all();
          return json({ profiles: all.results || [] }, corsHeaders);
        }
        const p = await env.DB.prepare('SELECT * FROM team_profiles WHERE phone = ?').bind(user.phone).first();
        return json({ profile: p || null }, corsHeaders);
      }

      if (path === '/api/team/players' && method === 'POST') {
        const user = await verifyToken(request, env);
        if (!user || (user.role !== 'team' && user.role !== 'admin')) {
          return json({ error: '无权访问' }, corsHeaders, 403);
        }

        let school = null;
        if (user.role === 'admin') {
          const { school: s } = await request.json().catch(() => ({}));
          school = s;
        } else {
          const profile = await env.DB.prepare('SELECT school FROM team_profiles WHERE phone = ?')
            .bind(user.phone).first();
          if (!profile) return json({ error: '请先绑定学校' }, corsHeaders, 400);
          school = profile.school;
        }
        if (!school) return json({ error: '缺少学校' }, corsHeaders, 400);

        const body = await request.json();
        const players = Array.isArray(body.players) ? body.players : [];
        const coachName = (body.coach && body.coach.name) ? String(body.coach.name).trim() : '';

        const POSITIONS = ['求生', '监管', '双边'];
        if (!players.length && !coachName) {
          return json({ error: '请至少提交一名选手或教练' }, corsHeaders, 400);
        }
        for (const p of players) {
          if (!p.name || !p.uid) return json({ error: '选手需填写 uid 和名字' }, corsHeaders, 400);
          if (!POSITIONS.includes(p.position)) return json({ error: '位置必须是：求生/监管/双边' }, corsHeaders, 400);
        }

        const now = new Date().toISOString();
        await env.DB.batch([
          env.DB.prepare('DELETE FROM players WHERE school = ?').bind(school),
          ...players.map(p => env.DB.prepare(
            'INSERT INTO players (school, name, cn_short, uid, position, is_coach, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
          ).bind(school, String(p.name).trim(), String(p.cn_short || '').trim() || null, String(p.uid).trim(), p.position, now)),
          ...(coachName ? [env.DB.prepare(
            'INSERT INTO players (school, name, cn_short, uid, position, is_coach, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)'
          ).bind(school, coachName, null, null, null, now)] : [])
        ]);

        return json({ ok: true, school, players: players.length, coach: coachName || null }, corsHeaders);
      }

      if (path === '/api/team/players' && method === 'GET') {
        const user = await verifyToken(request, env);
        if (!user || (user.role !== 'team' && user.role !== 'admin' && user.role !== 'judge')) {
          return json({ error: '无权访问' }, corsHeaders, 403);
        }

        const url2 = new URL(request.url);
        let school = url2.searchParams.get('school');
        if (!school) {
          if (user.role === 'admin') {
            const all = await env.DB.prepare('SELECT * FROM players ORDER BY school, is_coach, id').all();
            return json({ players: all.results || [] }, corsHeaders);
          }
          if (user.role === 'judge') {
            return json({ error: '请指定要查看的学校 school 参数' }, corsHeaders, 400);
          }
          const profile = await env.DB.prepare('SELECT school FROM team_profiles WHERE phone = ?')
            .bind(user.phone).first();
          school = profile ? profile.school : '';
          if (!school) return json({ players: [], school: null }, corsHeaders);
        }
        const rows = await env.DB.prepare('SELECT * FROM players WHERE school = ? ORDER BY is_coach, id')
          .bind(school).all();
        return json({ players: rows.results || [], school }, corsHeaders);
      }

      /* ============================================================
         数据看板聚合接口（仅管理员）
      ============================================================ */
      if (path === '/api/database/tables' && method === 'GET') {
        const user = await verifyToken(request, env);
        if (!user || user.role !== 'admin') return json({ error: '无权访问' }, corsHeaders, 403);

        const entries = await Promise.all(Object.keys(DASHBOARD_TABLES).map(async table => {
          const config = DASHBOARD_TABLES[table];
          const result = await env.DB.prepare(
            `SELECT ${config.columns.join(', ')} FROM ${table} ORDER BY ${config.primaryKey} DESC LIMIT 200`
          ).all();
          return dashboardTablePayload(table, result.results || []);
        }));
        return json({ tables: entries, rowLimit: 200 }, corsHeaders);
      }

      const databaseRoute = path.match(/^\/api\/database\/tables\/([a-z_]+)\/rows(?:\/(.+))?$/);
      if (databaseRoute) {
        const user = await verifyToken(request, env);
        if (!user || user.role !== 'admin') return json({ error: '无权访问' }, corsHeaders, 403);

        const table = databaseRoute[1];
        const rowKey = databaseRoute[2] ? decodeURIComponent(databaseRoute[2]) : null;
        const config = DASHBOARD_TABLES[table];
        if (!config) return json({ error: '不支持的数据表' }, corsHeaders, 404);
        if (!config.writable) return json({ error: '此表仅供查看，不能直接修改' }, corsHeaders, 403);

        if (method === 'POST' && !rowKey) {
          const body = await request.json();
          const values = body && body.values;
          if (!values || typeof values !== 'object' || Array.isArray(values)) {
            return json({ error: '请提交 values 对象' }, corsHeaders, 400);
          }
          const insertable = config.columns.filter(column => column !== 'created_at' && Object.prototype.hasOwnProperty.call(values, column));
          if (config.columns.includes('created_at')) {
            insertable.push('created_at');
            values.created_at = new Date().toISOString();
          }
          if (!insertable.length) return json({ error: '没有可写入的字段' }, corsHeaders, 400);
          const placeholders = insertable.map(() => '?').join(', ');
          await env.DB.prepare(`INSERT INTO ${table} (${insertable.join(', ')}) VALUES (${placeholders})`)
            .bind(...insertable.map(column => values[column])).run();
          return json({ ok: true }, corsHeaders, 201);
        }

        if (method === 'PATCH' && rowKey) {
          const body = await request.json();
          const values = body && body.values;
          if (!values || typeof values !== 'object' || Array.isArray(values)) {
            return json({ error: '请提交 values 对象' }, corsHeaders, 400);
          }
          const editable = config.columns.filter(column => column !== config.primaryKey && column !== 'created_at' && Object.prototype.hasOwnProperty.call(values, column));
          if (!editable.length) return json({ error: '没有可修改的字段' }, corsHeaders, 400);
          const setClause = editable.map(column => `${column} = ?`).join(', ');
          const result = await env.DB.prepare(`UPDATE ${table} SET ${setClause} WHERE ${config.primaryKey} = ?`)
            .bind(...editable.map(column => values[column]), rowKey).run();
          if (!result.meta.changes) return json({ error: '目标记录不存在' }, corsHeaders, 404);
          return json({ ok: true }, corsHeaders);
        }

        if (method === 'DELETE' && rowKey) {
          const result = await env.DB.prepare(`DELETE FROM ${table} WHERE ${config.primaryKey} = ?`).bind(rowKey).run();
          if (!result.meta.changes) return json({ error: '目标记录不存在' }, corsHeaders, 404);
          return json({ ok: true }, corsHeaders);
        }
        return json({ error: '不支持的操作' }, corsHeaders, 405);
      }

      if (path === '/api/dashboard' && method === 'GET') {
        const user = await verifyToken(request, env);
        if (!user || user.role !== 'admin') {
          return json({ error: '无权访问' }, corsHeaders, 403);
        }

        const [teamsR, schedR, playersR, bindsR, annsR, usrsR] = await Promise.all([
          env.DB.prepare('SELECT id, name, short, logo, created_at FROM teams ORDER BY id').all(),
          env.DB.prepare('SELECT * FROM schedule ORDER BY id DESC LIMIT 1').first(),
          env.DB.prepare('SELECT school, name, uid, position, is_coach FROM players ORDER BY school, is_coach, id').all(),
          env.DB.prepare('SELECT * FROM team_profiles ORDER BY school').all(),
          env.DB.prepare('SELECT id, tag, tag_class, time, text, created_at FROM announcements ORDER BY id DESC').all(),
          env.DB.prepare('SELECT id, username, phone, role, created_at FROM users ORDER BY id').all()
        ]);

        const teams = teamsR.results || [];
        const players = playersR.results || [];
        const bindings = bindsR.results || [];
        const announcements = annsR.results || [];
        const users = usrsR.results || [];

        let sched = null;
        if (schedR) {
          let matches = [];
          try { matches = JSON.parse(schedR.matches); } catch (e) {}
          sched = { id: schedR.id, title: schedR.title || '', matches, created_at: schedR.created_at };
        }

        const positions = { '求生': 0, '监管': 0, '双边': 0 };
        const bySchool = {};
        let coachesTotal = 0;
        players.forEach(p => {
          if (p.is_coach) { coachesTotal++; return; }
          if (positions[p.position] !== undefined) positions[p.position]++;
          bySchool[p.school] = (bySchool[p.school] || 0) + 1;
        });
        const playersBySchool = Object.keys(bySchool)
          .map(s => ({ school: s, count: bySchool[s] }))
          .sort((a, b) => b.count - a.count);

        const roleDist = {};
        users.forEach(u => { roleDist[u.role] = (roleDist[u.role] || 0) + 1; });

        const stats = {
          teams: teams.length,
          scheduleMatches: sched ? sched.matches.length : 0,
          schoolsBound: bindings.length,
          playersTotal: players.length - coachesTotal,
          coachesTotal,
          announcements: announcements.length,
          users: users.length
        };

        return json({ stats, teams, schedule: sched, players, playersBySchool, positions, coachesTotal, bindings, announcements, users, roleDist }, corsHeaders);
      }

      return json({ error: 'Not Found: ' + path }, corsHeaders, 404);

    } catch (err) {
      return json({ error: err.message || '服务器内部错误' }, corsHeaders, 500);
    }
  }
};

/* ============================================================
   工具函数
============================================================ */

function json(data, headers, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
  });
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function base64UrlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(base64url) {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function signToken(payload, env) {
  const days = parseInt(env.JWT_EXPIRES_DAYS || '7', 10);
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify({
    ...payload,
    exp: Date.now() + days * 86400000
  }));
  const secret = env.JWT_SECRET || 'dev-secret-please-change';
  const sig = await sha256(`${header}.${body}.${secret}`);
  return `${header}.${body}.${sig}`;
}

async function verifyToken(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, body, sig] = parts;
    const secret = env.JWT_SECRET || 'dev-secret-please-change';
    const expected = await sha256(`${header}.${body}.${secret}`);

    if (sig !== expected) return null;

    const payload = JSON.parse(base64UrlDecode(body));
    if (payload.exp && payload.exp < Date.now()) return null;
    if (payload.role === 'press') payload.role = 'commentator';

    return payload;
  } catch {
    return null;
  }
}

/* 解析时间：无时区标记的按北京时间 (UTC+8) 处理 */
function parseBeijingTime(value) {
  if (!value) return new Date(NaN);
  const raw = String(value).trim();
  if (/[zZ]$/.test(raw) || /[+-]\d{2}:?\d{2}$/.test(raw)) return new Date(raw);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const [, Y, Mo, D, h, mi, s] = m;
    return new Date(Date.UTC(+Y, +Mo - 1, +D, +h - 8, +mi, +(s || 0)));
  }
  return new Date(raw);
}