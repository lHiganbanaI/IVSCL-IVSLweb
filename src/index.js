/* ============================================================
   IVSCL & IVSL 联合赛季 · 后端 API
   Cloudflare Workers + D1
============================================================ */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const corsHeaders = {
      'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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

        const code = await env.DB.prepare(
          'SELECT * FROM invite_codes WHERE code = ?'
        ).bind(inviteCode.trim().toUpperCase()).first();

        if (!code) return json({ error: '激活码无效' }, corsHeaders, 400);
        if (code.used) return json({ error: '激活码已被使用' }, corsHeaders, 400);

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

        await env.DB.prepare(
          'UPDATE invite_codes SET used = 1, used_by = ? WHERE code = ?'
        ).bind(phone, code.code).run();

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

      if (path === '/api/announcements') {
        if (method === 'GET') {
          const result = await env.DB.prepare(
            'SELECT * FROM announcements ORDER BY id DESC'
          ).all();
          return json({ announcements: result.results || [] }, corsHeaders);
        }

        if (method === 'POST') {
          const user = await verifyToken(request, env);
          if (!user || user.role !== 'admin') {
            return json({ error: '无权访问' }, corsHeaders, 403);
          }

          const { tag, tagClass, time, text } = await request.json();
          if (!text) return json({ error: '正文不能为空' }, corsHeaders, 400);

          const info = await env.DB.prepare(
            'INSERT INTO announcements (tag, tag_class, time, text, created_at) VALUES (?, ?, ?, ?, ?)'
          ).bind(
            tag || '公告',
            tagClass || 'tag--notice',
            time || '今天',
            text,
            new Date().toISOString()
          ).run();

          return json({ id: info.meta.last_row_id }, corsHeaders);
        }
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
          const result = await env.DB.prepare(
            'SELECT id, name, short, logo, created_at FROM teams ORDER BY id ASC'
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

          /* 直接返回新增的完整队伍对象，避免前端再拉一次全表 */
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

      if (path.startsWith('/api/teams/') && method === 'DELETE') {
        const user = await verifyToken(request, env);
        if (!user || user.role !== 'admin') {
          return json({ error: '无权访问' }, corsHeaders, 403);
        }
        const id = path.split('/').pop();
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

          const { code, password, title } = await request.json();
          if (!code) return json({ error: '房间号不能为空' }, corsHeaders, 400);

          const info = await env.DB.prepare(
            'INSERT INTO rooms (code, password, title, creator, created_at) VALUES (?, ?, ?, ?, ?)'
          ).bind(
            code,
            password || '',
            title || '',
            user.username || '匿名',
            new Date().toISOString()
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

    return payload;
  } catch {
    return null;
  }
}