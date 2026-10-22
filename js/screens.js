// Shop / Achievements / Missions screens (DOM). Rendering only; all rules live in GR.Cosmetics and GR.Progress.
// One delegated click listener (in main.js) calls GR.Screens.click(); no timers, no loops.
GR.Screens = (function () {
  const $ = function (id) { return document.getElementById(id); };
  const S = GR.Storage, C = GR.Cosmetics, P = GR.Progress;
  let sel = { skin: null, trail: null }, pending = null, msg = '';
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function progressBar(v, max) {
    const b = el('div', 'bar'), i = el('i'); i.style.width = Math.round(100 * v / max) + '%';
    b.setAttribute('role', 'progressbar'); b.setAttribute('aria-valuemin', 0); b.setAttribute('aria-valuemax', max); b.setAttribute('aria-valuenow', v); b.appendChild(i); return b;
  }
  function row(cls) { const r = el('div', 'item' + (cls ? ' ' + cls : '')); r.setAttribute('role', 'listitem'); return r; }

  function renderShop() {
    $('shopCoins').textContent = S.get('coins');
    const list = $('shopList'), keep = list.scrollTop; list.textContent = '';
    [['PLAYER SKINS', C.SKINS], ['TRAILS', C.TRAILS]].forEach(function (g) {
      list.appendChild(el('h3', 'sec', g[0]));
      g[1].forEach(function (it) {
        const isEq = C.equipped(it.type) === it.id, isOwned = C.owned(it.id), r = row(isEq ? 'eq' : ''); r.dataset.id = it.id;
        const sw = el('span', 'sw'); sw.style.borderColor = it.line || it.sw; sw.style.background = it.body || 'transparent'; r.appendChild(sw);
        r.appendChild(el('span', 'nm', it.name));
        r.appendChild(el('span', 'st', isEq ? 'EQUIPPED' : isOwned ? 'OWNED' : 'LOCKED - ' + it.price + ' COINS'));
        const isPv = sel[it.type] === it.id;
        const pv = el('button', isPv ? 'pv-active' : '', 'PREVIEW'); pv.dataset.shop = 'preview'; pv.dataset.id = it.id;
        pv.setAttribute('aria-label', (isPv ? 'Previewing ' : 'Preview ') + it.name);
        if (isPv) pv.setAttribute('aria-pressed', 'true');
        r.appendChild(pv);
        if (!isEq) {
          const a = el('button', '', isOwned ? 'EQUIP' : 'BUY ' + it.price); a.dataset.shop = isOwned ? 'equip' : 'buy'; a.dataset.id = it.id;
          a.setAttribute('aria-label', (isOwned ? 'Equip ' : 'Buy ') + it.name + (isOwned ? '' : ' for ' + it.price + ' coins')); r.appendChild(a);
        }
        list.appendChild(r);
      });
    });
    list.scrollTop = keep;
    const sk = sel.skin || C.equipped('skin'), tr = sel.trail || C.equipped('trail');
    C.setPreview(sk, tr);
    $('previewName').textContent = C.item(sk).name + ' + ' + C.item(tr).name;
    $('shopMsg').textContent = msg;
    const it = pending && C.item(pending);
    $('shopConfirm').classList.toggle('hidden', !it);
    if (it) { $('confirmText').textContent = 'Buy ' + it.name + ' for ' + it.price + ' coins? Balance after: ' + (S.get('coins') - it.price); $('confirmOk').focus(); }
  }
  function renderAch() {
    const L = P.achievements(), list = $('achList'); list.textContent = '';
    $('achSummary').textContent = L.filter(function (a) { return a.done; }).length + ' / ' + L.length + ' UNLOCKED';
    L.forEach(function (a) {
      const r = row(a.done ? 'eq' : ''), nm = el('div', 'nm'); nm.appendChild(el('div', '', a.name)); nm.appendChild(el('small', '', a.desc)); nm.appendChild(progressBar(a.value, a.goal)); r.appendChild(nm);
      r.appendChild(el('span', 'st', (a.done ? 'UNLOCKED ' : 'LOCKED ') + a.value + '/' + a.goal)); list.appendChild(r);
    });
  }
  function renderMissions() {
    const v = P.missionsView(), list = $('missList'); list.textContent = '';
    $('missCoins').textContent = S.get('coins'); $('missDay').textContent = 'TODAY: ' + v.day;
    v.missions.forEach(function (m) {
      const r = row(m.done ? 'eq' : ''), nm = el('div', 'nm'); nm.appendChild(el('div', '', m.name)); nm.appendChild(el('small', '', m.desc + ' - reward +' + m.reward + ' coins')); nm.appendChild(progressBar(m.value, m.target)); r.appendChild(nm);
      r.appendChild(el('span', 'st', m.paid ? 'DONE - PAID' : m.done ? 'DONE' : m.value + '/' + m.target)); list.appendChild(r);
    });
  }
  function render(name) {
    if (name === 'shop') { sel = { skin: null, trail: null }; pending = null; msg = ''; renderShop(); }
    else if (name === 'achievements') renderAch();
    else if (name === 'missions') renderMissions();
  }
  function lines(box, arr) { box.textContent = ''; arr.forEach(function (t) { box.appendChild(el('div', '', t)); }); }
  function overNotes(i) {
    const n = i.notes || { ach: [], missions: [] }, out = [];
    if (i.frags > 0) out.push('+' + i.frags + ' COINS BANKED');
    n.missions.forEach(function (m) { out.push('MISSION COMPLETE: ' + m.name + ' +' + m.reward + ' COINS'); });
    n.ach.forEach(function (a) { out.push('ACHIEVEMENT UNLOCKED: ' + a); });
    lines($('overNotes'), out);
  }
  function menuNotes() { lines($('menuNotes'), P.takeNotices()); }
  function back() { if (pending) { pending = null; msg = 'PURCHASE CANCELLED'; renderShop(); return true; } return false; }
  function click(btn) {
    const a = btn.dataset.shop, id = btn.dataset.id, it = id && C.item(id);
    if (a === 'preview' && it) { sel[it.type] = id; msg = ''; }
    else if (a === 'buy' && it) {
      if (C.owned(id)) msg = it.name + ' IS ALREADY OWNED';
      else if (S.get('coins') < it.price) msg = 'NOT ENOUGH COINS - NEED ' + (it.price - S.get('coins')) + ' MORE';
      else { pending = id; msg = ''; sel[it.type] = id; }
    } else if (a === 'confirm') {
      const pid = pending; pending = null;
      const r = pid ? C.buy(pid) : { ok: false, reason: 'none' };
      if (r.ok && GR.Audio) GR.Audio.play('buy');
      msg = r.ok ? 'PURCHASED ' + r.item.name + '! PRESS EQUIP TO USE IT' : r.reason === 'funds' ? 'NOT ENOUGH COINS - NEED ' + r.need + ' MORE' : r.reason === 'owned' ? 'ALREADY OWNED' : 'PURCHASE FAILED';
    } else if (a === 'cancel') { pending = null; msg = 'PURCHASE CANCELLED'; }
    else if (a === 'equip' && it) { msg = C.equip(id) ? 'EQUIPPED ' + it.name : 'CANNOT EQUIP ' + it.name; if (C.equipped(it.type) === id) sel[it.type] = null; }
    renderShop();
  }
  return { render: render, click: click, back: back, overNotes: overNotes, menuNotes: menuNotes };
})();
