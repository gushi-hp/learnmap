(function () {
  'use strict';

  const LS_PREFIX = 'learnmap-';
  const LS_KEY = LS_PREFIX + 'apikey';
  const LS_THEME = LS_PREFIX + 'theme';
  const LS_LAST = LS_PREFIX + 'last';
  const LS_INDEX = LS_PREFIX + 'index';
  const LS_DATA = LS_PREFIX + 'data:';
  const LS_PHYSICS = LS_PREFIX + 'physics';

  const PHYSICS_DEFAULT = { repel: 9000, link: 180 };
  const physics = Object.assign({}, PHYSICS_DEFAULT, (() => {
    try { return JSON.parse(localStorage.getItem(LS_PHYSICS) || '{}'); } catch { return {}; }
  })());
  function savePhysics() {
    localStorage.setItem(LS_PHYSICS, JSON.stringify(physics));
  }

  // ============== DeepSeek API ==============
  function getApiKey() { return localStorage.getItem(LS_KEY) || ''; }
  function setApiKey(k) { localStorage.setItem(LS_KEY, k); }

  function sanitizeTag(s) {
    return String(s || '')
      .trim()
      .replace(/^#+/, '')
      .replace(/\s+/g, '-')
      .replace(/[,;`'"\\]/g, '')
      .slice(0, 30);
  }
  function sanitizeTags(arr) {
    if (!Array.isArray(arr)) return [];
    const seen = new Set();
    const out = [];
    for (const t of arr) {
      const c = sanitizeTag(t);
      if (!c) continue;
      if (seen.has(c)) continue;
      seen.add(c);
      out.push(c);
      if (out.length >= 6) break;
    }
    return out;
  }

  function extractJsonArray(text) {
    if (!text) return null;
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) return null;
    try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
  }

  async function aiExpand(word, context) {
    const key = getApiKey();
    if (!key) throw new Error('请先点击右上角 ⚙ 设置 DeepSeek API Key');
    const ctx = context || word;
    const systemPrompt = `你是一个知识架构师。你的任务是把一个学习节点拆成3-5个直接子节点——只往下一层走，但混合不同"质地"的输出，让知识树自然地从概念过渡到实操。你只返回 JSON 数组，不返回其他内容。`;
    const userPrompt = `用户正在学习"${ctx}"，当前节点是"${word}"。请为"${word}"发散 3-5 个子节点。

=== 核心原则 ===

1. 只往下一层走——每个子节点比"${word}"具体一步，不是一步到床底。
2. 混合质地——不要所有子节点都是同一种东西。一轮发散里应该同时有：
   - 需要进一步拆解的概念/方法论（还能继续点+）
   - 可以直接上手的实操/工具/具体技术（接近 leaf）

=== 自然降维 ===

知识树从根到叶，应该自然地从"概念"过渡到"操作"：
  上层偏概念：曝光控制、构图原理、光线运用
  中层混合：对称构图、三分法、侧光与逆光
  下层偏实操：Lightroom中的对称裁剪、日出黄金时刻拍摄技巧

你不需要判断当前在第几层。你只需要确保输出的3-5个节点里，至少混入一个比纯概念更"动手"的节点。比如概念拆出来的子节点里，可以有一个直接是可操作的技术或工具。

=== 避免的错误 ===

  ❌ 无限理论链：构图原理 → 对称与平衡 → 对称的视觉心理 → 对称美学史
     → 问题：永远在"是什么/为什么"里打转，不到"怎么做"

  ❌ 换词不换层：摄影技巧 → 摄影方法 → 摄影手段
     → 问题：换了个说法，没有比父节点更具体

  ✅ 正确的下潜：构图原理 → 对称构图 / 三分法 / 引导线 / 框架构图 / 负空间
     → 从"构图是什么"下到"具体有哪些构图法"，是实打实的一层

=== 发散角度（挑2-3个方向，不要全用一个方向）===
- 包含哪些子模块/分支？
- 需要掌握什么具体方法或技术？
- 用什么工具或软件来实现？
- 有哪些常见场景或应用？

=== 标签规则 ===
每个词附带 tags，2-4个中文短词（无#号、无空格、用连字符）：
- 至少一个类型标签：工具、理论、技能、实操、规范、资源
- 至少一个领域标签：用"${ctx}"领域的专业术语
- 不同节点的标签应体现差异

=== 输出格式 ===
每个词包含 zh、en、leaf、tags 四个字段，JSON 数组。
leaf: true 仅当该词已经是最小学习单元（具体命令、单一参数、固定公式），再拆只能拆出百度级别的零碎。`;

    const r = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0.4,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });
    if (!r.ok) {
      let msg = 'HTTP ' + r.status;
      try { const j = await r.json(); msg = j.error?.message || msg; } catch {}
      throw new Error('DeepSeek 调用失败：' + msg);
    }
    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content || '';
    const arr = extractJsonArray(content);
    if (!Array.isArray(arr)) throw new Error('JSON 解析失败');
    return arr.filter(x => x && x.zh).map(x => ({
      zh: String(x.zh).trim(),
      en: String(x.en || '').trim(),
      leaf: !!x.leaf,
      tags: sanitizeTags(x.tags)
    }));
  }

  // ============== Storage (localStorage) ==============
  function listIndustries() {
    try { return JSON.parse(localStorage.getItem(LS_INDEX) || '[]'); } catch { return []; }
  }
  function saveIndex(arr) { localStorage.setItem(LS_INDEX, JSON.stringify(arr)); }
  function loadData(name) {
    try { return JSON.parse(localStorage.getItem(LS_DATA + name) || 'null'); } catch { return null; }
  }
  function saveData(name, payload) {
    localStorage.setItem(LS_DATA + name, JSON.stringify(payload));
    const idx = listIndustries();
    const i = idx.findIndex(x => x.industry === name);
    const entry = { industry: name, nodes: payload.nodes.length, mtime: Date.now() };
    if (i >= 0) idx[i] = entry; else idx.push(entry);
    idx.sort((a, b) => b.mtime - a.mtime);
    saveIndex(idx);
  }
  function removeData(name) {
    localStorage.removeItem(LS_DATA + name);
    saveIndex(listIndustries().filter(x => x.industry !== name));
  }

  // ============== Theme ==============
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.querySelector('.theme-icon').textContent = t === 'dark' ? '☾' : '☀';
  }

  // ============== Graph ==============
  function createGraph(host, edgesSvg, nodesLayer, onChange) {
    let industry = null;
    let nodes = new Map();
    let edges = [];
    let view = { tx: 0, ty: 0, scale: 1 };
    let history = [];
    let saveTimer = null, posSaveTimer = null;
    let panState = null, dragState = null;
    let settlePhase = null;
    let physicsActiveUntil = 0;
    const expanded = new Set();
    const velocities = new Map();
    let rafId = null;

    function uid() { return 'n_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
    function norm(s) { return String(s || '').trim().toLowerCase(); }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function findByWord(word) {
      const w = norm(word);
      for (const n of nodes.values()) if (norm(n.zh) === w) return n;
      return null;
    }
    function getHostRect() { return host.getBoundingClientRect(); }
    function screenToWorld(sx, sy) {
      const r = getHostRect();
      return { x: (sx - r.left - view.tx) / view.scale, y: (sy - r.top - view.ty) / view.scale };
    }
    function getCanvasCenter() {
      const r = getHostRect();
      return { x: (r.width / 2 - view.tx) / view.scale, y: (r.height / 2 - view.ty) / view.scale };
    }
    function applyTransform() {
      nodesLayer.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`;
      edgesSvg.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`;
      const lab = document.getElementById('zoom-label');
      if (lab) lab.textContent = Math.round(view.scale * 100) + '%';
    }
    function addEdge(src, tgt, dashed) {
      if (src === tgt) return;
      if (edges.some(e => e.source === src && e.target === tgt)) return;
      edges.push({ source: src, target: tgt, dashed: !!dashed });
    }
    function childrenOf(id) {
      return edges.filter(e => e.source === id && !e.dashed).map(e => e.target);
    }
    function descendantsOf(id) {
      const out = new Set();
      const stack = [id];
      while (stack.length) {
        const cur = stack.pop();
        for (const e of edges) {
          if (e.source === cur && !e.dashed && !out.has(e.target)) {
            out.add(e.target);
            stack.push(e.target);
          }
        }
      }
      return out;
    }
    function ancestorsOf(id) {
      const out = new Set();
      const stack = [id];
      while (stack.length) {
        const cur = stack.pop();
        for (const e of edges) {
          if (e.target === cur && !e.dashed && !out.has(e.source)) {
            out.add(e.source);
            stack.push(e.source);
          }
        }
      }
      return out;
    }
    function isRootNode(id) {
      return !edges.some(e => e.target === id && !e.dashed);
    }
    function serializeNodes() {
      return Array.from(nodes.values()).map(n => ({
        id: n.id, zh: n.zh, en: n.en, leaf: n.leaf, x: n.x, y: n.y, manual: n.manual,
        tags: Array.isArray(n.tags) ? n.tags.slice() : []
      }));
    }
    function updateWelcome() {
      const w = document.getElementById('welcome');
      if (w) w.style.display = nodes.size === 0 ? 'flex' : 'none';
    }
    function render() { renderNodes(); renderEdges(); updateWelcome(); }
    function renderNodes() {
      const ids = new Set(nodes.keys());
      nodesLayer.querySelectorAll('.node').forEach(el => {
        if (!ids.has(el.dataset.id)) el.remove();
      });
      for (const node of nodes.values()) {
        let el = nodesLayer.querySelector(`.node[data-id="${node.id}"]`);
        if (!el) {
          el = document.createElement('div');
          el.className = 'node enter';
          el.dataset.id = node.id;
          el.innerHTML =
            '<div class="node-inner"><div class="node-zh"></div><div class="node-en"></div></div>' +
            '<button class="node-plus" title="展开">+</button>' +
            '<span class="node-badge"></span>';
          nodesLayer.appendChild(el);
          bindNode(el, node);
          setTimeout(() => el.classList.remove('enter'), 600);
        }
        el.querySelector('.node-zh').textContent = node.zh;
        el.querySelector('.node-en').textContent = node.en || '';
        el.classList.toggle('leaf', !!node.leaf);
        el.classList.toggle('manual', !!node.manual);
        const kids = childrenOf(node.id);
        const badge = el.querySelector('.node-badge');
        const plus = el.querySelector('.node-plus');
        if (node.leaf) {
          plus.style.display = 'none';
          badge.style.display = 'none';
        } else {
          plus.style.display = '';
          if (kids.length > 0) { badge.style.display = ''; badge.textContent = kids.length; }
          else badge.style.display = 'none';
        }
        el.style.transform = `translate(${node.x}px, ${node.y}px) translate(-50%, -50%)`;
      }
    }
    function renderEdges() {
      edgesSvg.innerHTML = '';
      const r = getHostRect();
      edgesSvg.setAttribute('width', r.width);
      edgesSvg.setAttribute('height', r.height);
      edgesSvg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
      edgesSvg.style.width = r.width + 'px';
      edgesSvg.style.height = r.height + 'px';
      for (const e of edges) {
        const a = nodes.get(e.source), b = nodes.get(e.target);
        if (!a || !b) continue;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const dx = b.x - a.x, dy = b.y - a.y;
        const cx1 = a.x + dx * 0.4, cy1 = a.y + dy * 0.05;
        const cx2 = a.x + dx * 0.6, cy2 = b.y - dy * 0.05;
        path.setAttribute('d', `M ${a.x} ${a.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${b.x} ${b.y}`);
        path.setAttribute('class', 'edge' + (e.dashed ? ' dashed' : ''));
        edgesSvg.appendChild(path);
      }
    }
    function bindNode(el, node) {
      const plus = el.querySelector('.node-plus');
      plus.addEventListener('click', async ev => {
        ev.stopPropagation();
        await expandNode(node.id);
      });
      el.addEventListener('click', ev => {
        ev.stopPropagation();
        if (ev.target === plus) return;
        nodesLayer.querySelectorAll('.node.active').forEach(n => { if (n !== el) n.classList.remove('active'); });
        el.classList.toggle('active');
      });
      el.addEventListener('pointerdown', ev => {
        if (ev.target.classList.contains('node-plus')) return;
        ev.stopPropagation();
        el.setPointerCapture && el.setPointerCapture(ev.pointerId);
        const start = screenToWorld(ev.clientX, ev.clientY);
        const followOffsets = childrenOf(node.id)
          .filter(cid => childrenOf(cid).length === 0)
          .map(cid => {
            const c = nodes.get(cid);
            return c ? { id: cid, ox: c.x - node.x, oy: c.y - node.y } : null;
          })
          .filter(Boolean);
        const ancestorIds = Array.from(ancestorsOf(node.id));
        dragState = {
          id: node.id, pointerId: ev.pointerId,
          offX: start.x - node.x, offY: start.y - node.y,
          moved: false, lastX: node.x, lastY: node.y, lastT: performance.now(),
          followOffsets,
          ancestorIds
        };
      });
    }
    function setNodeBusy(id, busy) {
      const el = nodesLayer.querySelector(`.node[data-id="${id}"]`);
      if (el) el.classList.toggle('busy', busy);
    }
    async function expandNode(id) {
      const node = nodes.get(id);
      if (!node || node.leaf || node._expanding) return;
      node._expanding = true;
      setNodeBusy(id, true);
      try {
        const items = await aiExpand(node.zh, industry || node.zh);
        const beforeNodes = serializeNodes();
        const beforeEdges = JSON.parse(JSON.stringify(edges));
        const angleStep = Math.PI * 2 / Math.max(items.length, 4);
        const startAng = Math.random() * Math.PI * 2;
        const radius = 220;
        const newIds = [];
        items.forEach((it, i) => {
          const existing = findByWord(it.zh);
          if (existing) { addEdge(id, existing.id, true); return; }
          const ang = startAng + angleStep * i + (Math.random() - 0.5) * 0.3;
          const x = node.x + Math.cos(ang) * radius;
          const y = node.y + Math.sin(ang) * radius;
          const n = { id: uid(), zh: it.zh, en: it.en, leaf: !!it.leaf, x, y, manual: false, tags: it.tags || [] };
          nodes.set(n.id, n);
          addEdge(id, n.id, false);
          newIds.push(n.id);
        });
        expanded.add(id);
        history.push({ type: 'expand', parent: id, beforeNodes, beforeEdges });
        if (history.length > 50) history.shift();
        render();
        if (newIds.length) startSettle(newIds, 60);
        scheduleSave();
        onChange && onChange();
      } catch (e) {
        alert(e.message);
      } finally {
        node._expanding = false;
        setNodeBusy(id, false);
      }
    }
    async function startWithIndustry(word) {
      industry = word;
      nodes.clear(); edges = []; history = []; expanded.clear();
      const c = getCanvasCenter();
      const root = { id: uid(), zh: word, en: '', leaf: false, x: c.x, y: c.y, manual: false, tags: [sanitizeTag(word)].filter(Boolean) };
      nodes.set(root.id, root);
      render();
      onChange && onChange();
      await expandNode(root.id);
      fitView();
      scheduleSave();
    }
    function loadIndustry(name) {
      industry = name;
      const data = loadData(name);
      nodes.clear(); edges = []; history = []; expanded.clear();
      if (data) {
        edges = data.edges || [];
        for (const n of data.nodes || []) nodes.set(n.id, Object.assign({}, n));
      }
      render();
      fitView();
      onChange && onChange();
    }
    function clearGraph() {
      if (!confirm('清空当前画布？')) return;
      nodes.clear(); edges = []; history = []; expanded.clear();
      render();
      scheduleSave();
      onChange && onChange();
    }
    function undo() {
      if (history.length === 0) return;
      const h = history.pop();
      if (h.type === 'expand') {
        nodes.clear();
        for (const n of h.beforeNodes) nodes.set(n.id, Object.assign({}, n));
        edges = h.beforeEdges;
        expanded.delete(h.parent);
      } else if (h.type === 'add') {
        nodes.delete(h.node.id);
        edges = edges.filter(e => e.source !== h.node.id && e.target !== h.node.id);
      }
      render();
      scheduleSave();
    }
    function addManualNode(zh) {
      const text = (zh || '').trim();
      if (!text) return null;
      const c = getCanvasCenter();
      const n = {
        id: uid(), zh: text, en: '', leaf: false,
        x: c.x + (Math.random() - 0.5) * 80,
        y: c.y + (Math.random() - 0.5) * 80,
        manual: true
      };
      nodes.set(n.id, n);
      history.push({ type: 'add', node: Object.assign({}, n) });
      render();
      scheduleSave();
      onChange && onChange();
      return n;
    }
    function zoomBy(factor, cx, cy) {
      const r = getHostRect();
      cx = (cx == null) ? r.width / 2 : cx;
      cy = (cy == null) ? r.height / 2 : cy;
      const before = screenToWorld(cx + r.left, cy + r.top);
      view.scale = clamp(view.scale * factor, 0.2, 5);
      const after = screenToWorld(cx + r.left, cy + r.top);
      view.tx += (after.x - before.x) * view.scale;
      view.ty += (after.y - before.y) * view.scale;
      applyTransform();
      renderEdges();
    }
    function fitView() {
      if (nodes.size === 0) {
        view = { tx: 0, ty: 0, scale: 1 };
        applyTransform(); renderEdges(); return;
      }
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of nodes.values()) {
        minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
        minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
      }
      const pad = 120;
      minX -= pad; minY -= pad; maxX += pad; maxY += pad;
      const r = getHostRect();
      const sx = r.width / (maxX - minX);
      const sy = r.height / (maxY - minY);
      const s = clamp(Math.min(sx, sy), 0.2, 1.5);
      view.scale = s;
      view.tx = r.width / 2 - ((minX + maxX) / 2) * s;
      view.ty = r.height / 2 - ((minY + maxY) / 2) * s;
      applyTransform(); renderEdges();
    }
    function autoLayout() {
      if (nodes.size === 0) return;
      const ids = Array.from(nodes.keys());
      const N = ids.length;
      const idx = new Map(ids.map((id, i) => [id, i]));
      const pos = ids.map(id => ({ x: nodes.get(id).x, y: nodes.get(id).y }));
      const k = 140, iterations = 220;
      for (let it = 0; it < iterations; it++) {
        const t = 1 - it / iterations;
        const disp = pos.map(() => ({ x: 0, y: 0 }));
        for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
          const dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y;
          const d2 = dx * dx + dy * dy + 0.01;
          const d = Math.sqrt(d2);
          const f = (k * k) / d;
          const ux = dx / d, uy = dy / d;
          disp[i].x += ux * f; disp[i].y += uy * f;
          disp[j].x -= ux * f; disp[j].y -= uy * f;
        }
        for (const e of edges) {
          const a = idx.get(e.source), b = idx.get(e.target);
          if (a == null || b == null) continue;
          const dx = pos[a].x - pos[b].x, dy = pos[a].y - pos[b].y;
          const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
          const f = (d * d) / k;
          const ux = dx / d, uy = dy / d;
          disp[a].x -= ux * f; disp[a].y -= uy * f;
          disp[b].x += ux * f; disp[b].y += uy * f;
        }
        const max = 60 * t + 4;
        for (let i = 0; i < N; i++) {
          const dx = disp[i].x, dy = disp[i].y;
          const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
          const m = Math.min(d, max);
          pos[i].x += (dx / d) * m;
          pos[i].y += (dy / d) * m;
        }
      }
      ids.forEach((id, i) => { const n = nodes.get(id); n.x = pos[i].x; n.y = pos[i].y; });
      render(); fitView(); scheduleSave();
    }
    // ============== 力导向物理引擎 ==============
    // 思路（参考 d3-force / Obsidian 图谱）：
    //   - 每对节点之间有持续的全局排斥力（反平方衰减），保证不重叠
    //   - 每条实线边是一根弹簧，拉到自然距离
    //   - 被拖节点直接锁到鼠标位置；其子树作为刚体跟随；其祖先链锁定不动
    //   - 整张图持续在跑物理：拖动、新节点出现都会触发活跃期
    function nodeVel(id) {
      let v = velocities.get(id);
      if (!v) { v = { vx: 0, vy: 0 }; velocities.set(id, v); }
      return v;
    }
    function ensurePhysics() {
      if (rafId) return;
      const tick = () => {
        const now = performance.now();
        const driving = !!dragState || !!settlePhase || now < physicsActiveUntil;
        if (!driving) { rafId = null; schedulePosSave(); return; }

        // —— 锁定集：只锁"被拖节点 + 祖先链"，子树留给软跟随处理 ——
        const lockedSet = new Set();
        if (dragState) {
          lockedSet.add(dragState.id);
          if (dragState.ancestorIds) for (const aid of dragState.ancestorIds) lockedSet.add(aid);
        }

        const ids = Array.from(nodes.keys());
        const N = ids.length;
        const fx = new Float32Array(N);
        const fy = new Float32Array(N);
        const idx = new Map(ids.map((id, i) => [id, i]));

        // —— 子树软跟随：弹簧拉向"开始拖时的相对偏移"，制造延迟惯性 ——
        // 子树不再被锁死，照常参与排斥/连线弹簧；快速拖动时会拖在后面，
        // 经过其他节点时也会互相挤一下，松手后逐渐归位。
        if (dragState && dragState.followOffsets && dragState.followOffsets.length) {
          const root = nodes.get(dragState.id);
          if (root) {
            const FOLLOW_K = 0.10;
            for (const fo of dragState.followOffsets) {
              const i = idx.get(fo.id);
              const n = nodes.get(fo.id);
              if (i == null || !n) continue;
              fx[i] += (root.x + fo.ox - n.x) * FOLLOW_K;
              fy[i] += (root.y + fo.oy - n.y) * FOLLOW_K;
            }
          }
        }

        // —— 全局排斥力（all-pairs，反距离衰减）——
        const REPEL = physics.repel;
        const MIN_DIST_SOFT = 30;
        for (let i = 0; i < N; i++) {
          const a = nodes.get(ids[i]);
          for (let j = i + 1; j < N; j++) {
            const b = nodes.get(ids[j]);
            let dx = a.x - b.x, dy = a.y - b.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < MIN_DIST_SOFT * MIN_DIST_SOFT) {
              if (d2 < 0.01) { dx = (Math.random() - 0.5); dy = (Math.random() - 0.5); d2 = dx*dx+dy*dy + 0.01; }
              d2 = MIN_DIST_SOFT * MIN_DIST_SOFT;
            }
            const f = REPEL / d2;
            const d = Math.sqrt(d2);
            const ux = dx / d, uy = dy / d;
            fx[i] += ux * f; fy[i] += uy * f;
            fx[j] -= ux * f; fy[j] -= uy * f;
          }
        }

        // —— 边的弹簧吸引力（保持父子自然间距）——
        const LINK_DIST = physics.link;
        const LINK_K = 0.04;
        for (const e of edges) {
          if (e.dashed) continue;
          const i = idx.get(e.source), j = idx.get(e.target);
          if (i == null || j == null) continue;
          const a = nodes.get(e.source), b = nodes.get(e.target);
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
          const diff = d - LINK_DIST;
          const f = diff * LINK_K;
          const ux = dx / d, uy = dy / d;
          fx[i] += ux * f; fy[i] += uy * f;
          fx[j] -= ux * f; fy[j] -= uy * f;
        }

        // —— 积分 ——
        const DAMP = 0.78;
        const VCAP = 12;
        let maxKinetic = 0;
        for (let i = 0; i < N; i++) {
          const id = ids[i];
          const n = nodes.get(id);
          const v = nodeVel(id);
          if (lockedSet.has(id)) {
            v.vx = 0; v.vy = 0;
            continue;
          }
          v.vx = (v.vx + fx[i]) * DAMP;
          v.vy = (v.vy + fy[i]) * DAMP;
          if (v.vx > VCAP) v.vx = VCAP; else if (v.vx < -VCAP) v.vx = -VCAP;
          if (v.vy > VCAP) v.vy = VCAP; else if (v.vy < -VCAP) v.vy = -VCAP;
          n.x += v.vx; n.y += v.vy;
          const k = v.vx * v.vx + v.vy * v.vy;
          if (k > maxKinetic) maxKinetic = k;
        }

        if (settlePhase) {
          settlePhase.frames -= 1;
          if (settlePhase.frames <= 0) settlePhase = null;
        }

        // 如果系统还在运动，延长活跃期；几乎静止时让它自然停下
        if (maxKinetic > 0.01 && (dragState || settlePhase)) {
          // 拖动/settle 中持续跑
        } else if (maxKinetic > 0.01) {
          physicsActiveUntil = now + 200;
        }

        for (const n of nodes.values()) {
          const el = nodesLayer.querySelector(`.node[data-id="${n.id}"]`);
          if (el) el.style.transform = `translate(${n.x}px, ${n.y}px) translate(-50%, -50%)`;
        }
        renderEdges();
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }
    function startSettle(ids, frames) {
      settlePhase = { ids: Array.from(new Set(ids)), frames: frames || 90 };
      physicsActiveUntil = performance.now() + 1500;
      ensurePhysics();
    }
    function isUiTarget(t) {
      if (!t) return false;
      return !!t.closest('.canvas-controls, .fab, .topbar, .sidebar, .theme-toggle, .settings-btn, .node, .input-status, .modal-mask');
    }
    function onPointerDown(ev) {
      if (isUiTarget(ev.target)) return;
      if (!host.contains(ev.target)) return;
      panState = { x: ev.clientX, y: ev.clientY, tx: view.tx, ty: view.ty };
    }
    function onPointerMove(ev) {
      if (dragState) {
        const node = nodes.get(dragState.id);
        if (!node) { dragState = null; return; }
        const w = screenToWorld(ev.clientX, ev.clientY);
        const nx = w.x - dragState.offX, ny = w.y - dragState.offY;
        const dx = nx - node.x, dy = ny - node.y;
        if (Math.abs(dx) + Math.abs(dy) > 1) dragState.moved = true;
        node.x = nx; node.y = ny;
        const v = nodeVel(node.id); v.vx = 0; v.vy = 0;
        const now = performance.now();
        const dt = Math.max(now - dragState.lastT, 1);
        dragState.vx = (node.x - dragState.lastX) / dt * 16;
        dragState.vy = (node.y - dragState.lastY) / dt * 16;
        dragState.lastX = node.x; dragState.lastY = node.y; dragState.lastT = now;
        ensurePhysics();
        ev.preventDefault();
        return;
      }
      if (panState) {
        view.tx = panState.tx + (ev.clientX - panState.x);
        view.ty = panState.ty + (ev.clientY - panState.y);
        applyTransform();
      }
    }
    function onPointerUp() {
      if (dragState) {
        const releaseCap = 8;
        const vx = clamp((dragState.vx || 0) * 0.25, -releaseCap, releaseCap);
        const vy = clamp((dragState.vy || 0) * 0.25, -releaseCap, releaseCap);
        const v = nodeVel(dragState.id);
        v.vx += vx; v.vy += vy;
        if (dragState.followOffsets) {
          for (const fo of dragState.followOffsets) {
            const fv = nodeVel(fo.id);
            fv.vx += vx; fv.vy += vy;
          }
        }
        dragState = null;
        physicsActiveUntil = performance.now() + 1500;
        ensurePhysics();
        schedulePosSave();
      }
      panState = null;
    }
    function onWheel(ev) {
      if (isUiTarget(ev.target)) return;
      if (!host.contains(ev.target)) return;
      ev.preventDefault();
      const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
      const r = getHostRect();
      zoomBy(factor, ev.clientX - r.left, ev.clientY - r.top);
    }
    function onKey(ev) {
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'z' || ev.key === 'Z')) {
        ev.preventDefault();
        undo();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
    document.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', () => renderEdges());

    function scheduleSave() {
      if (!industry) return;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveData(industry, { industry, nodes: serializeNodes(), edges });
      }, 300);
    }
    function schedulePosSave() {
      if (!industry) return;
      if (posSaveTimer) clearTimeout(posSaveTimer);
      posSaveTimer = setTimeout(() => {
        saveData(industry, { industry, nodes: serializeNodes(), edges });
      }, 500);
    }

    applyTransform();
    render();

    return {
      startWithIndustry, loadIndustry, clearGraph, addManualNode,
      undo, fitView, autoLayout, zoomBy,
      exportObsidian: () => exportObsidianVault(industry, nodes, edges),
      getIndustry: () => industry,
      kick: () => { physicsActiveUntil = performance.now() + 800; ensurePhysics(); }
    };
  }

  // ============== Obsidian 导出 ==============
  // Obsidian 通过 [[wikilink]] 自动建立双向关联。
  // 我们把每个节点写成一个 .md 文件，正文里用 wikilink 列出父级、子级、关联节点。
  // 文件名做合法化处理（去掉 \\ / : * ? " < > | 等不允许的字符）。
  // 打包成无压缩 zip（store mode），用户解压后整个文件夹直接当 Obsidian Vault 打开即可。

  function sanitizeFilename(s) {
    return String(s || '')
      .replace(/[\\/:*?"<>|#^[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'untitled';
  }

  function buildObsidianFiles(industry, nodesMap, edges) {
    const nodes = Array.from(nodesMap.values());
    const usedNames = new Map();
    const idToName = new Map();
    for (const n of nodes) {
      let base = sanitizeFilename(n.zh);
      let name = base;
      let suffix = 2;
      while (usedNames.has(name) && usedNames.get(name) !== n.id) {
        name = base + ' ' + suffix++;
      }
      usedNames.set(name, n.id);
      idToName.set(n.id, name);
    }

    const parents = new Map();   // id -> [parentIds]（实线）
    const children = new Map();  // id -> [childIds]（实线）
    const related = new Map();   // id -> [otherIds]（虚线 / 关联）
    for (const id of nodesMap.keys()) {
      parents.set(id, []); children.set(id, []); related.set(id, []);
    }
    for (const e of edges) {
      if (e.dashed) {
        related.get(e.source)?.push(e.target);
        related.get(e.target)?.push(e.source);
      } else {
        children.get(e.source)?.push(e.target);
        parents.get(e.target)?.push(e.source);
      }
    }

    const wiki = id => {
      const nm = idToName.get(id);
      return nm ? `[[${nm}]]` : '';
    };

    const files = [];
    const today = new Date().toISOString().slice(0, 10);

    for (const n of nodes) {
      const nm = idToName.get(n.id);
      const tags = Array.isArray(n.tags) ? n.tags.filter(Boolean) : [];
      const tagsBlock = tags.length
        ? ['tags:', ...tags.map(t => `  - ${t}`)].join('\n')
        : null;
      const fm = [
        '---',
        `title: "${n.zh.replace(/"/g, '\\"')}"`,
        n.en ? `aliases: ["${n.en.replace(/"/g, '\\"')}"]` : null,
        tagsBlock,
        `领域: "${(industry || '').replace(/"/g, '\\"')}"`,
        n.leaf ? '类型: 叶子节点' : '类型: 主题节点',
        n.manual ? '来源: 手动添加' : '来源: AI 发散',
        `创建: ${today}`,
        '---',
      ].filter(Boolean).join('\n');

      const lines = [fm, '', `# ${n.zh}`];
      if (n.en) lines.push(`*${n.en}*`, '');
      else lines.push('');

      const ps = parents.get(n.id) || [];
      const cs = children.get(n.id) || [];
      const rs = related.get(n.id) || [];

      if (ps.length) {
        lines.push('## 上级');
        for (const pid of ps) lines.push(`- ${wiki(pid)}`);
        lines.push('');
      }
      if (cs.length) {
        lines.push('## 下级');
        for (const cid of cs) lines.push(`- ${wiki(cid)}`);
        lines.push('');
      }
      if (rs.length) {
        lines.push('## 关联');
        for (const rid of rs) lines.push(`- ${wiki(rid)}`);
        lines.push('');
      }

      lines.push('## 笔记');
      lines.push('');
      lines.push('在这里记录你的学习笔记…');
      lines.push('');

      files.push({ path: `${nm}.md`, content: lines.join('\n') });
    }

    return files;
  }

  // ============== 手写 ZIP（store mode，无压缩）==============
  // 仅依赖浏览器的 TextEncoder，保持纯前端零依赖。
  function crc32Table() {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  }
  const CRC_TABLE = crc32Table();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeZip(files) {
    const enc = new TextEncoder();
    const localChunks = [];
    const centralChunks = [];
    let offset = 0;
    for (const f of files) {
      const nameBytes = enc.encode(f.path);
      const data = enc.encode(f.content);
      const crc = crc32(data);
      const size = data.length;

      // local file header
      const lh = new Uint8Array(30 + nameBytes.length);
      const dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);                // version
      dv.setUint16(6, 0x0800, true);            // general purpose: UTF-8 filename
      dv.setUint16(8, 0, true);                 // store
      dv.setUint16(10, 0, true);                // mod time
      dv.setUint16(12, 0, true);                // mod date
      dv.setUint32(14, crc, true);
      dv.setUint32(18, size, true);
      dv.setUint32(22, size, true);
      dv.setUint16(26, nameBytes.length, true);
      dv.setUint16(28, 0, true);
      lh.set(nameBytes, 30);
      localChunks.push(lh, data);

      // central directory entry
      const cd = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      cd.set(nameBytes, 46);
      centralChunks.push(cd);

      offset += lh.length + data.length;
    }

    const localTotal = localChunks.reduce((s, b) => s + b.length, 0);
    const centralTotal = centralChunks.reduce((s, b) => s + b.length, 0);

    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralTotal, true);
    ev.setUint32(16, localTotal, true);
    ev.setUint16(20, 0, true);

    const total = localTotal + centralTotal + eocd.length;
    const out = new Uint8Array(total);
    let p = 0;
    for (const b of localChunks) { out.set(b, p); p += b.length; }
    for (const b of centralChunks) { out.set(b, p); p += b.length; }
    out.set(eocd, p);
    return out;
  }

  function downloadBlob(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  }

  function exportObsidianVault(industry, nodesMap, edges) {
    if (!nodesMap || nodesMap.size === 0) {
      alert('画布为空，先输入一个领域生成节点吧');
      return;
    }
    const folder = sanitizeFilename(industry || '学习路线图') + ' Vault';
    const files = buildObsidianFiles(industry, nodesMap, edges).map(f => ({
      path: `${folder}/${f.path}`,
      content: f.content
    }));
    const zip = makeZip(files);
    downloadBlob(zip, folder + '.zip');
  }

  // ============== Sidebar ==============
  function renderSidebar(host, current, onSelect, onDelete) {
    const items = listIndustries();
    if (items.length === 0) {
      host.innerHTML = '<li class="empty">还没有领域<br/><span>在上方输入开始</span></li>';
      return;
    }
    host.innerHTML = items.map(it => `
      <li class="industry-item ${it.industry === current ? 'active' : ''}" data-industry="${escAttr(it.industry)}">
        <span class="ind-name">${escHtml(it.industry)}</span>
        <span class="ind-count">${it.nodes}</span>
        <button class="ind-del" title="删除">×</button>
      </li>
    `).join('');
    host.querySelectorAll('.industry-item').forEach(li => {
      const ind = li.dataset.industry;
      li.addEventListener('click', e => {
        if (e.target.classList.contains('ind-del')) return;
        onSelect(ind);
      });
      li.querySelector('.ind-del').addEventListener('click', e => {
        e.stopPropagation();
        if (!confirm(`删除「${ind}」？`)) return;
        removeData(ind);
        onDelete(ind);
      });
    });
  }
  function escHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function escAttr(s) { return escHtml(s); }

  // ============== Boot ==============
  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(localStorage.getItem(LS_THEME) || 'light');
    document.getElementById('theme-toggle').addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || 'light';
      const next = cur === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem(LS_THEME, next);
    });

    // settings modal
    const modal = document.getElementById('key-modal');
    const keyInput = document.getElementById('key-input');
    const repelInput = document.getElementById('repel-input');
    const repelVal = document.getElementById('repel-val');
    const linkInput = document.getElementById('link-input');
    const linkVal = document.getElementById('link-val');

    function syncSliderUI() {
      repelInput.value = String(physics.repel);
      repelVal.textContent = String(physics.repel);
      linkInput.value = String(physics.link);
      linkVal.textContent = String(physics.link);
    }
    syncSliderUI();

    function openModal() {
      keyInput.value = getApiKey();
      syncSliderUI();
      modal.style.display = 'flex';
      setTimeout(() => keyInput.focus(), 50);
    }
    function closeModal() { modal.style.display = 'none'; }
    document.getElementById('settings-btn').addEventListener('click', openModal);
    document.getElementById('key-cancel').addEventListener('click', () => {
      // 取消：把内存里的物理参数恢复成 localStorage 里上次保存的值
      const saved = (() => { try { return JSON.parse(localStorage.getItem(LS_PHYSICS) || '{}'); } catch { return {}; } })();
      physics.repel = saved.repel != null ? saved.repel : PHYSICS_DEFAULT.repel;
      physics.link = saved.link != null ? saved.link : PHYSICS_DEFAULT.link;
      syncSliderUI();
      closeModal();
    });
    document.getElementById('key-save').addEventListener('click', () => {
      setApiKey(keyInput.value.trim());
      savePhysics();
      closeModal();
    });
    document.getElementById('key-reset').addEventListener('click', () => {
      physics.repel = PHYSICS_DEFAULT.repel;
      physics.link = PHYSICS_DEFAULT.link;
      syncSliderUI();
      graph.kick();
    });
    repelInput.addEventListener('input', () => {
      physics.repel = parseInt(repelInput.value, 10) || 0;
      repelVal.textContent = String(physics.repel);
      graph.kick();
    });
    linkInput.addEventListener('input', () => {
      physics.link = parseInt(linkInput.value, 10) || 0;
      linkVal.textContent = String(physics.link);
      graph.kick();
    });
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    const graph = createGraph(
      document.getElementById('canvas-host'),
      document.getElementById('edges'),
      document.getElementById('nodes-layer'),
      () => {
        const cur = graph.getIndustry();
        renderSidebar(document.getElementById('industry-list'), cur, onSelectIndustry, onDeleteIndustry);
        if (cur) localStorage.setItem(LS_LAST, cur);
      }
    );

    function onSelectIndustry(name) {
      graph.loadIndustry(name);
      document.getElementById('industry-input').value = name;
      localStorage.setItem(LS_LAST, name);
      renderSidebar(document.getElementById('industry-list'), name, onSelectIndustry, onDeleteIndustry);
    }
    function onDeleteIndustry(name) {
      if (graph.getIndustry() === name) location.reload();
      else renderSidebar(document.getElementById('industry-list'), graph.getIndustry(), onSelectIndustry, onDeleteIndustry);
    }

    // input
    const input = document.getElementById('industry-input');
    const submitBtn = document.getElementById('industry-submit');
    const status = document.getElementById('input-status');
    let busy = false;
    async function submit() {
      const v = input.value.trim();
      if (!v || busy) return;
      if (!getApiKey()) { openModal(); return; }
      busy = true; submitBtn.disabled = true;
      status.textContent = 'AI 正在思考…'; status.className = 'input-status loading';
      try {
        await graph.startWithIndustry(v);
        status.textContent = ''; status.className = 'input-status';
      } catch (e) {
        status.textContent = '失败：' + e.message;
        status.className = 'input-status error';
      } finally {
        busy = false; submitBtn.disabled = false;
      }
    }
    submitBtn.addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });

    // canvas controls
    document.querySelector('.canvas-controls').addEventListener('click', e => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'zoom-in') graph.zoomBy(1.2);
      else if (act === 'zoom-out') graph.zoomBy(1 / 1.2);
      else if (act === 'fit') graph.fitView();
      else if (act === 'layout') graph.autoLayout();
      else if (act === 'export') graph.exportObsidian();
      else if (act === 'clear') graph.clearGraph();
    });
    document.getElementById('add-node-fab').addEventListener('click', () => {
      const v = prompt('节点名称');
      if (v && v.trim()) graph.addManualNode(v.trim());
    });

    // initial sidebar
    renderSidebar(document.getElementById('industry-list'), null, onSelectIndustry, onDeleteIndustry);
    const last = localStorage.getItem(LS_LAST);
    if (last && loadData(last)) {
      onSelectIndustry(last);
    } else {
      input.focus();
    }

    // first-run hint
    if (!getApiKey()) setTimeout(openModal, 400);
  });
})();
