import { useState, useEffect, useCallback, useRef } from "react";
import { getRoom, setRoom, delRoom, watchRoom, listRooms } from "./firebase";

// ╔══════════════════════════════════════════════════════════╗
// ║  定数                                                      ║
// ╚══════════════════════════════════════════════════════════╝
const SUITS = ["筒", "萬", "索"];
const SUIT_COLOR = { 筒: "#5eb8f5", 萬: "#f5705e", 索: "#5ef57c" };
const NUMS = [1, 2, 3];
const BG     = "#091509";
const PANEL  = "#0d1e0d";
const GOLD   = "#d4a017";
const ROOM_TTL_MS = 60 * 60 * 1000;   // 1時間
const MATCH_OPTIONS = [1, 3, 5];

// ╔══════════════════════════════════════════════════════════╗
// ║  牌生成                                                    ║
// ╚══════════════════════════════════════════════════════════╝
let _uid = 0;
function makeDeck() {
  _uid = 0;
  const d = [];
  for (const suit of SUITS)
    for (const num of NUMS)
      for (let c = 0; c < 4; c++)
        d.push({ suit, num, uid: _uid++ });
  return d;
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ╔══════════════════════════════════════════════════════════╗
// ║  ゲームロジック                                            ║
// ╚══════════════════════════════════════════════════════════╝
function chkSet(ts) {
  if (ts.length !== 3) return null;
  const [a, b, c] = ts;
  if (a.suit !== b.suit || b.suit !== c.suit) return null;
  const ns = [a.num, b.num, c.num].sort((x, y) => x - y);
  if (ns[0] === ns[1] && ns[1] === ns[2]) return "triplet";
  if (ns[0] === 1 && ns[1] === 2 && ns[2] === 3) return "sequence";
  return null;
}
function chkWin(h) {
  if (h.length !== 6) return null;
  for (let i = 0; i < 4; i++)
    for (let j = i + 1; j < 5; j++)
      for (let k = j + 1; k < 6; k++) {
        const s1  = [h[i], h[j], h[k]];
        const rem = h.filter((_, x) => x !== i && x !== j && x !== k);
        const t1  = chkSet(s1);
        const t2  = chkSet(rem);
        if (t1 && t2) return [{ tiles: s1, type: t1 }, { tiles: rem, type: t2 }];
      }
  return null;
}
function tenpai(h5) {
  const waits = [];
  for (const suit of SUITS)
    for (const num of NUMS) {
      const fake = { suit, num, uid: -1 };
      if (chkWin([...h5, fake])) {
        if (!waits.some(w => w.suit === suit && w.num === num))
          waits.push({ suit, num });
      }
    }
  return waits;
}
function potential(h5) {
  let sc = 0;
  for (let i = 0; i < 3; i++)
    for (let j = i + 1; j < 4; j++)
      for (let k = j + 1; k < 5; k++) {
        const trio = [h5[i], h5[j], h5[k]];
        if (chkSet(trio)) { sc += 20; continue; }
        if (trio[0].suit === trio[1].suit && trio[1].suit === trio[2].suit) {
          const ns = [trio[0].num, trio[1].num, trio[2].num].sort((a, b) => a - b);
          if (ns[0] === ns[1] || ns[1] === ns[2]) sc += 5;
          if (ns[1] - ns[0] === 1 || ns[2] - ns[1] === 1) sc += 2;
        }
      }
  if (tenpai(h5).length > 0) sc += 50;
  return sc;
}
function aiDiscard(h6) {
  let best = -1, idx = 0;
  for (let i = 0; i < h6.length; i++) {
    const sc = potential(h6.filter((_, x) => x !== i));
    if (sc > best) { best = sc; idx = i; }
  }
  return idx;
}
function calcPts(sets, riichi, isFirstOfMatch, dora) {
  let pts = 0;
  const lines = [];
  for (const s of sets) {
    if (s.type === "sequence") { pts += 2; lines.push("連番 +2"); }
    if (s.type === "triplet")  { pts += 1; lines.push("同数 +1"); }
    const dc = dora ? s.tiles.filter(t => t.suit === dora.suit && t.num === dora.num).length : 0;
    if (dc) { pts += dc; lines.push(`ドラ×${dc} +${dc}`); }
  }
  if (isFirstOfMatch) { pts += 1; lines.push("早上がり +1"); }
  if (riichi)         { pts += 1; lines.push("リーチ +1"); }
  return { pts, lines };
}
function initAI(carry = {}) {
  const { score = { p: 0, a: 0 }, target = 3, firstWinner = null, matchWins = { p: 0, a: 0 } } = carry;
  const deck = shuffle(makeDeck());
  return {
    pHand: deck.slice(0, 5),
    aHand: deck.slice(5, 10),
    wall:  deck.slice(11),
    dora:  deck[10],
    phase: "draw", turn: "p",
    pRiichi: false, aRiichi: false,
    pDiscard: [], aDiscard: [],
    firstWinner, score, matchWins, target,
    msg: "あなたのターンです",
  };
}
function initMP(carry = {}) {
  const { score = { host: 0, guest: 0 }, target = 3, firstWinner = null, matchWins = { host: 0, guest: 0 } } = carry;
  const deck = shuffle(makeDeck());
  return {
    hostHand:  deck.slice(0, 5),
    guestHand: deck.slice(5, 10),
    wall:  deck.slice(11),
    dora:  deck[10],
    phase: "draw", turn: "host",
    hostRiichi: false, guestRiichi: false,
    hostDiscard: [], guestDiscard: [],
    firstWinner, score, matchWins, target,
    msg: "ホストのターン",
    result: null,
  };
}

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const genCode = () => Array.from({ length: 4 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");
const genId   = () => Math.random().toString(36).slice(2, 10);

// 起動時クリーンアップ
async function cleanupOldRooms() {
  try {
    const rooms = await listRooms();
    const now = Date.now();
    for (const [code, data] of Object.entries(rooms || {})) {
      if (data.createdAt && now - data.createdAt > ROOM_TTL_MS) {
        try { await delRoom(code); } catch {}
      }
    }
  } catch {}
}

// ╔══════════════════════════════════════════════════════════╗
// ║  Tile コンポーネント                                       ║
// ╚══════════════════════════════════════════════════════════╝
function Tile({ tile, sel, onClick, isNew, isDora, back, small }) {
  const col = back ? "#264026" : SUIT_COLOR[tile?.suit] || "#888";
  const W = small ? 36 : 46, H = small ? 50 : 65;
  return (
    <div
      onClick={onClick}
      style={{
        width: W, height: H,
        background: back
          ? `linear-gradient(145deg,#1a2e1a,#0d1a0d)`
          : `linear-gradient(150deg,#eef9ee,#c8e8c8)`,
        border: `2px solid ${sel ? GOLD : col}`,
        borderRadius: 8,
        cursor: onClick ? "pointer" : "default",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        transform: sel ? "translateY(-12px)" : "none",
        transition: "transform .15s, border-color .15s, box-shadow .15s",
        position: "relative",
        boxShadow: sel ? `0 10px 24px ${col}99, 0 0 0 1px ${GOLD}66` : "0 2px 8px #00000088",
        userSelect: "none", flexShrink: 0,
      }}
    >
      {!back && tile && (
        <>
          <span style={{ fontSize: small ? 16 : 22, fontWeight: 900, color: col, lineHeight: 1 }}>{tile.num}</span>
          <span style={{ fontSize: small ? 8 : 10, fontWeight: 700, color: col, opacity: 0.85 }}>{tile.suit}</span>
          {isNew && (
            <span style={{ position: "absolute", top: -7, right: -7, background: GOLD, color: "#000", fontSize: 8, fontWeight: 900, borderRadius: "50%", width: 15, height: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>新</span>
          )}
          {isDora && (
            <span style={{ position: "absolute", bottom: -7, left: -7, background: "#f5705e", color: "#fff", fontSize: 8, fontWeight: 900, borderRadius: "50%", width: 15, height: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>★</span>
          )}
        </>
      )}
    </div>
  );
}

const containerStyle = {
  minHeight: "100vh", background: BG,
  backgroundImage: `radial-gradient(ellipse 90% 55% at 50% 0%, #0d2b0d 0%, ${BG} 70%), repeating-linear-gradient(45deg, #0d1e0d11 0px, #0d1e0d11 1px, transparent 1px, transparent 8px)`,
  display: "flex", flexDirection: "column", alignItems: "center",
  fontFamily: "'Noto Serif JP','Yu Mincho','Hiragino Mincho ProN',serif",
  color: "#c8e8c8",
  padding: "20px 12px 32px", boxSizing: "border-box",
};

// ╔══════════════════════════════════════════════════════════╗
// ║  ルートコンポーネント                                       ║
// ╚══════════════════════════════════════════════════════════╝
export default function App() {
  const [mode, setMode]     = useState("menu");
  const [target, setTarget] = useState(3);
  const [room, setRoom]     = useState(null);

  useEffect(() => { cleanupOldRooms(); }, []);

  if (mode === "menu")       return <Menu target={target} setTarget={setTarget} onSelect={setMode} />;
  if (mode === "rules")      return <Rules onBack={() => setMode("menu")} />;
  if (mode === "ai")         return <AIGame target={target} onExit={() => setMode("menu")} />;
  if (mode === "mp-lobby")   return <MPLobby onCreate={() => setMode("mp-create")} onJoin={() => setMode("mp-join")} onBack={() => setMode("menu")} />;
  if (mode === "mp-create")  return <MPCreate target={target} onReady={r => { setRoom(r); setMode("mp"); }} onBack={() => setMode("mp-lobby")} />;
  if (mode === "mp-join")    return <MPJoin   onReady={r => { setRoom(r); setMode("mp"); }} onBack={() => setMode("mp-lobby")} />;
  if (mode === "mp" && room) return <MPGame room={room} onExit={() => { setRoom(null); setMode("menu"); }} />;
  return null;
}

function Title({ small, sub }) {
  return (
    <div style={{ textAlign: "center", marginBottom: small ? 12 : 20 }}>
      <h1 style={{ fontSize: small ? 26 : 36, fontWeight: 900, margin: 0, letterSpacing: 6, color: GOLD, textShadow: `0 0 40px ${GOLD}55, 0 2px 4px #000` }}>タイパ麻雀</h1>
      <div style={{ fontSize: 10, color: "#5ef57c55", letterSpacing: 4, marginTop: 3 }}>{sub || "SPEED MAHJONG 1v1"}</div>
    </div>
  );
}

function Menu({ target, setTarget, onSelect }) {
  const btn = {
    width: "100%", padding: "16px 20px",
    background: PANEL, color: GOLD,
    border: `2px solid ${GOLD}66`, borderRadius: 12,
    fontSize: 16, fontWeight: 900, letterSpacing: 4,
    cursor: "pointer", marginBottom: 12, fontFamily: "inherit",
    boxShadow: `0 4px 16px #00000077`,
  };
  return (
    <div style={containerStyle}>
      <div style={{ marginTop: 30 }}><Title /></div>
      <div style={{
        background: PANEL, border: `1px solid ${GOLD}44`,
        borderRadius: 12, padding: "12px 20px", marginBottom: 20,
        display: "flex", gap: 10, alignItems: "center",
      }}>
        <span style={{ fontSize: 11, color: "#c8e8c888", letterSpacing: 2 }}>マッチ</span>
        {MATCH_OPTIONS.map(n => (
          <button key={n} onClick={() => setTarget(n)}
            style={{
              background: target === n ? GOLD : "transparent",
              color: target === n ? "#091509" : GOLD,
              border: `1px solid ${target === n ? GOLD : GOLD + "44"}`,
              borderRadius: 6, padding: "5px 12px",
              fontSize: 12, fontWeight: 900, cursor: "pointer",
              fontFamily: "inherit",
            }}
          >先取{n}本</button>
        ))}
      </div>
      <div style={{ width: "100%", maxWidth: 320 }}>
        <button style={btn} onClick={() => onSelect("ai")}>🤖  AI 対 戦</button>
        <button style={btn} onClick={() => onSelect("mp-lobby")}>👥  オンライン対戦</button>
        <button
          style={{ ...btn, fontSize: 13, color: "#c8e8c8aa", border: `1px solid #5ef57c33`, letterSpacing: 3 }}
          onClick={() => onSelect("rules")}
        >📖  遊び方</button>
      </div>
    </div>
  );
}

function Rules({ onBack }) {
  const sec = { background: PANEL, border: `1px solid ${GOLD}33`, borderRadius: 10, padding: "12px 16px", marginBottom: 10, width: "100%", maxWidth: 460, boxSizing: "border-box" };
  const h2 = { fontSize: 12, color: GOLD, letterSpacing: 3, marginBottom: 6, fontWeight: 900 };
  const p  = { fontSize: 12, color: "#c8e8c8cc", lineHeight: 1.8 };
  const li = { fontSize: 12, color: "#c8e8c8cc", lineHeight: 1.8, marginLeft: 16 };
  return (
    <div style={containerStyle}>
      <div style={{ marginTop: 20 }}><Title small sub="HOW TO PLAY" /></div>

      <div style={sec}>
        <div style={h2}>🀄 牌</div>
        <p style={p}>筒・萬・索の <b style={{ color: GOLD }}>1〜3</b> が各4枚、計36枚。</p>
        <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
          {SUITS.map(s => NUMS.map(n =>
            <Tile key={s+n} tile={{ suit: s, num: n, uid: s+n }} small />
          ))}
        </div>
      </div>

      <div style={sec}>
        <div style={h2}>🎯 上がり</div>
        <p style={p}>手牌は通常<b>5枚</b>。山から<b>1枚ツモ</b>して<b>6枚</b>になった瞬間、<b style={{ color: GOLD }}>「3枚役 × 2組」</b>が揃えば上がり。</p>
        <p style={li}>• <b style={{ color: SUIT_COLOR.筒 }}>連番</b>: 同じ種類の 1-2-3</p>
        <p style={li}>• <b style={{ color: SUIT_COLOR.萬 }}>同数</b>: 同じ種類の同じ数字3枚</p>
        <p style={p}>上がらなければ<b>1枚捨て</b>て5枚に戻す。</p>
      </div>

      <div style={sec}>
        <div style={h2}>⚡ リーチ</div>
        <p style={p}>聴牌（あと1枚で上がり）したら<b style={{ color: GOLD }}>リーチ宣言</b>可能。宣言後は引いた牌を自動で捨て、上がり牌が来れば自動ツモ。点数 <b>+1</b>。</p>
      </div>

      <div style={sec}>
        <div style={h2}>💰 得点</div>
        <p style={li}>• <b style={{ color: SUIT_COLOR.筒 }}>連番</b>セット <b>+2点</b></p>
        <p style={li}>• <b style={{ color: SUIT_COLOR.萬 }}>同数</b>セット <b>+1点</b></p>
        <p style={li}>• <b style={{ color: "#f5705e" }}>ドラ</b>（毎ゲーム1種指定）1枚につき <b>+1点</b></p>
        <p style={li}>• <b style={{ color: GOLD }}>早上がり</b>（マッチ最初の上がり）<b>+1点</b></p>
        <p style={li}>• <b style={{ color: GOLD }}>リーチ</b>達成時 <b>+1点</b></p>
      </div>

      <div style={sec}>
        <div style={h2}>🏆 マッチ</div>
        <p style={p}>先取設定の本数を先に達成した方が勝利。例: 先取3本なら3勝先取で優勝。</p>
      </div>

      <div style={sec}>
        <div style={h2}>👥 オンライン対戦</div>
        <p style={li}>• 4文字のルームコードを発行・共有して対戦</p>
        <p style={li}>• Firebase Realtime DB でリアルタイム同期（遅延 〜100ms）</p>
        <p style={li}>• 1時間経過したルームは自動削除</p>
      </div>

      <button onClick={onBack} style={{
        marginTop: 16, padding: "10px 32px",
        background: PANEL, color: "#c8e8c8aa",
        border: `1px solid ${GOLD}44`, borderRadius: 9, fontSize: 13,
        cursor: "pointer", letterSpacing: 3, fontFamily: "inherit",
      }}>← メニュー</button>
    </div>
  );
}

function MPLobby({ onCreate, onJoin, onBack }) {
  const btn = {
    width: "100%", padding: "16px 20px",
    background: PANEL, color: GOLD,
    border: `2px solid ${GOLD}66`, borderRadius: 12,
    fontSize: 15, fontWeight: 900, letterSpacing: 3,
    cursor: "pointer", marginBottom: 12, fontFamily: "inherit",
  };
  return (
    <div style={containerStyle}>
      <div style={{ marginTop: 30 }}><Title small /></div>
      <div style={{ color: GOLD, fontSize: 16, marginTop: 16, marginBottom: 20, letterSpacing: 3 }}>オンライン対戦</div>
      <div style={{ width: "100%", maxWidth: 320 }}>
        <button style={btn} onClick={onCreate}>🎲  部屋を作る</button>
        <button style={btn} onClick={onJoin}>🔑  部屋に参加</button>
        <button style={{ ...btn, color: "#c8e8c866", border: `1px solid #5ef57c33`, fontSize: 12, fontWeight: 400, letterSpacing: 2 }} onClick={onBack}>← 戻る</button>
      </div>
    </div>
  );
}

function MPCreate({ target, onReady, onBack }) {
  const [code, setCode] = useState(null);
  const [myId] = useState(genId);
  const [status, setStatus] = useState("作成中…");
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState(null);
  const cancelRef = useRef(false);
  const unsubRef  = useRef(null);

  useEffect(() => {
    cancelRef.current = false;
    (async () => {
      try {
        // 重複しないコード生成
        let c, exists = true, tries = 0;
        while (exists && tries < 8) {
          c = genCode();
          try { await getRoom(c); } catch { exists = false; }
          tries++;
        }
        if (cancelRef.current) return;
        await setRoom(c, {
          hostId: myId, guestId: null, state: null, ver: 0,
          createdAt: Date.now(), target,
        });
        if (cancelRef.current) return;
        setCode(c);
        setStatus("相手の参加を待っています…");

        // リアルタイム監視
        unsubRef.current = watchRoom(c, async (data) => {
          if (cancelRef.current || !data) return;
          if (data.guestId && !data.state) {
            const initState = initMP({ target });
            await setRoom(c, { ...data, state: initState, ver: 1 });
            if (!cancelRef.current) onReady({ code: c, role: "host", myId });
          }
        });
      } catch (e) {
        if (!cancelRef.current) setErr("接続エラー: " + (e.message || "Firebase設定を確認"));
      }
    })();
    return () => {
      cancelRef.current = true;
      if (unsubRef.current) unsubRef.current();
    };
  }, [myId, target, onReady]);

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div style={containerStyle}>
      <div style={{ marginTop: 30 }}><Title small /></div>
      <div style={{ color: GOLD, fontSize: 14, marginTop: 16, marginBottom: 8, letterSpacing: 3 }}>部屋を作成</div>

      {err && (
        <div style={{ color: "#f5705e", fontSize: 12, marginBottom: 16, padding: "8px 12px", background: "#f5705e22", borderRadius: 6 }}>
          ⚠ {err}
        </div>
      )}

      {code && (
        <>
          <div style={{ color: "#c8e8c888", fontSize: 12, marginBottom: 12 }}>このコードを友達に伝えてください</div>
          <div
            onClick={copyCode}
            style={{
              background: PANEL, border: `2px solid ${GOLD}`, borderRadius: 14,
              padding: "24px 36px", marginBottom: 12,
              boxShadow: `0 0 60px ${GOLD}33`,
              cursor: "pointer", position: "relative",
            }}
          >
            <div style={{
              fontSize: 44, fontWeight: 900, color: GOLD,
              letterSpacing: 12, fontFamily: "monospace",
              textShadow: `0 0 24px ${GOLD}66`,
            }}>{code}</div>
            <div style={{ position: "absolute", bottom: 4, right: 8, fontSize: 9, color: `${GOLD}88`, letterSpacing: 1 }}>
              📋 タップでコピー
            </div>
          </div>
          {copied && (
            <div style={{ color: "#5ef57c", fontSize: 11, marginBottom: 8, letterSpacing: 2 }}>✓ コピーしました</div>
          )}
          <div style={{ color: `${GOLD}88`, fontSize: 10, marginBottom: 14, letterSpacing: 2 }}>
            先取{target}本マッチ
          </div>
        </>
      )}

      {!err && (
        <div style={{ color: "#c8e8c8aa", fontSize: 13, marginBottom: 20, letterSpacing: 1 }}>
          <span style={{ display: "inline-block", animation: "pulse 1.5s infinite" }}>●</span> {status}
        </div>
      )}

      <button onClick={onBack} style={{
        padding: "10px 32px", background: PANEL, color: "#c8e8c866",
        border: `1px solid #5ef57c33`, borderRadius: 9, fontSize: 12,
        cursor: "pointer", fontFamily: "inherit",
      }}>キャンセル</button>

      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>
    </div>
  );
}

function MPJoin({ onReady, onBack }) {
  const [code, setCode] = useState("");
  const [myId] = useState(genId);
  const [err, setErr] = useState(null);
  const [joining, setJoining] = useState(false);

  const join = async () => {
    if (code.length !== 4) { setErr("4文字のコードを入力してください"); return; }
    setErr(null); setJoining(true);
    try {
      const c = code.toUpperCase();
      const data = await getRoom(c);
      if (data.guestId) { setErr("この部屋は既に満員です"); setJoining(false); return; }
      await setRoom(c, { ...data, guestId: myId });
      onReady({ code: c, role: "guest", myId });
    } catch {
      setErr("部屋が見つかりません");
      setJoining(false);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={{ marginTop: 30 }}><Title small /></div>
      <div style={{ color: GOLD, fontSize: 14, marginTop: 16, marginBottom: 20, letterSpacing: 3 }}>部屋に参加</div>
      <div style={{ color: "#c8e8c888", fontSize: 12, marginBottom: 12 }}>ルームコードを入力</div>

      <input
        value={code}
        onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
        placeholder="ABCD" maxLength={4} autoFocus
        style={{
          background: PANEL, border: `2px solid ${GOLD}66`,
          color: GOLD, fontSize: 36, fontWeight: 900,
          letterSpacing: 12, textAlign: "center",
          padding: "20px 24px", borderRadius: 14, width: 200,
          fontFamily: "monospace", marginBottom: 16, outline: "none",
        }}
      />

      {err && <div style={{ color: "#f5705e", fontSize: 12, marginBottom: 12 }}>⚠ {err}</div>}

      <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 320 }}>
        <button onClick={join} disabled={joining || code.length !== 4}
          style={{
            flex: 2, padding: "12px 0",
            background: code.length === 4 && !joining ? GOLD : PANEL,
            color: code.length === 4 && !joining ? "#091509" : `${GOLD}44`,
            border: "none", borderRadius: 9, fontSize: 15, fontWeight: 900,
            cursor: code.length === 4 && !joining ? "pointer" : "not-allowed",
            letterSpacing: 3, fontFamily: "inherit",
          }}
        >{joining ? "接続中…" : "参加"}</button>
        <button onClick={onBack} style={{
          flex: 1, padding: "12px 0",
          background: PANEL, color: "#c8e8c866",
          border: `1px solid #5ef57c33`, borderRadius: 9, fontSize: 12,
          cursor: "pointer", fontFamily: "inherit",
        }}>戻る</button>
      </div>
    </div>
  );
}

function AIGame({ target, onExit }) {
  const [g, setG]     = useState(() => initAI({ target }));
  const [sel, setSel] = useState(-1);
  const upd = useCallback(fn => setG(prev => fn(prev)), []);

  useEffect(() => {
    if (g.phase !== "draw" || g.turn !== "p") return;
    const t = setTimeout(() => {
      upd(g => {
        if (!g.wall.length)
          return { ...g, phase: "end", result: "draw", msg: "山が尽きました。引き分け。" };
        const [drawn, ...wall] = g.wall;
        const h6 = [...g.pHand, drawn];
        if (chkWin(h6)) {
          const sets = chkWin(h6);
          const isFirst = !g.firstWinner;
          const { pts, lines } = calcPts(sets, g.pRiichi, isFirst, g.dora);
          return {
            ...g, wall, pHand: h6,
            firstWinner: isFirst ? "p" : g.firstWinner,
            phase: "end", result: "p",
            score: { ...g.score, p: g.score.p + pts },
            matchWins: { ...g.matchWins, p: g.matchWins.p + 1 },
            msg: `🎉 ツモ！ ${pts}点（${lines.join("・")}）`,
          };
        }
        if (g.pRiichi)
          return { ...g, wall, pDiscard: [...g.pDiscard, drawn], phase: "ai", msg: "リーチ中…AIのターン" };
        return { ...g, wall, pHand: h6, phase: "sel", msg: "ツモ。捨てる牌を選んでください。" };
      });
      setSel(-1);
    }, 450);
    return () => clearTimeout(t);
  }, [g.phase, g.turn, upd]);

  useEffect(() => {
    if (g.phase !== "ai") return;
    const t = setTimeout(() => {
      upd(g => {
        if (!g.wall.length)
          return { ...g, phase: "end", result: "draw", msg: "山が尽きました。引き分け。" };
        const [drawn, ...wall] = g.wall;
        const h6 = [...g.aHand, drawn];
        if (chkWin(h6)) {
          const sets = chkWin(h6);
          const isFirst = !g.firstWinner;
          const { pts, lines } = calcPts(sets, g.aRiichi, isFirst, g.dora);
          return {
            ...g, wall, aHand: h6,
            firstWinner: isFirst ? "a" : g.firstWinner,
            phase: "end", result: "a",
            score: { ...g.score, a: g.score.a + pts },
            matchWins: { ...g.matchWins, a: g.matchWins.a + 1 },
            msg: `AIがツモ！ ${pts}点（${lines.join("・")}）`,
          };
        }
        if (g.aRiichi)
          return { ...g, wall, aDiscard: [...g.aDiscard, drawn], phase: "draw", turn: "p", msg: "あなたのターン" };
        const di = aiDiscard(h6);
        const hand = h6.filter((_, i) => i !== di);
        const declRiichi = tenpai(hand).length > 0;
        return {
          ...g, wall, aHand: hand,
          aDiscard: [...g.aDiscard, h6[di]],
          aRiichi: g.aRiichi || declRiichi,
          phase: "draw", turn: "p",
          msg: declRiichi ? "⚡ AIがリーチ宣言！あなたのターン" : "あなたのターン",
        };
      });
    }, 950);
    return () => clearTimeout(t);
  }, [g.phase, upd]);

  const doDiscard = useCallback(() => {
    if (sel < 0) return;
    setG(g => {
      if (g.pRiichi || g.phase !== "sel") return g;
      const h5 = g.pHand.filter((_, i) => i !== sel);
      const pDiscard = [...g.pDiscard, g.pHand[sel]];
      if (tenpai(h5).length > 0)
        return { ...g, pHand: h5, pDiscard, phase: "rq", msg: "聴牌！リーチを宣言しますか？" };
      return { ...g, pHand: h5, pDiscard, phase: "ai", msg: "AIのターン…" };
    });
    setSel(-1);
  }, [sel]);

  const declareRiichi = yes => {
    setG(g => ({ ...g, pRiichi: yes, phase: "ai", msg: yes ? "⚡ リーチ宣言！AIのターン…" : "AIのターン…" }));
  };

  const matchOver = g.matchWins.p >= g.target || g.matchWins.a >= g.target;
  const matchWinner = g.matchWins.p >= g.target ? "p" : g.matchWins.a >= g.target ? "a" : null;

  return (
    <GameBoard
      g={g} sel={sel} setSel={setSel}
      doDiscard={doDiscard} declareRiichi={declareRiichi}
      onNext={() => {
        if (matchOver) setG(initAI({ target }));
        else setG(prev => initAI({
          score: prev.score, target: prev.target,
          firstWinner: prev.firstWinner, matchWins: prev.matchWins,
        }));
        setSel(-1);
      }}
      onExit={onExit}
      labels={{ me: "あなた", opp: "AI", oppEmoji: "🤖" }}
      matchOver={matchOver} matchWinner={matchWinner}
    />
  );
}

function MPGame({ room, onExit }) {
  const [mpState, setMpState] = useState(null);
  const [sel, setSel]   = useState(-1);
  const [oppLeft, setOppLeft] = useState(false);
  const verRef     = useRef(0);
  const writingRef = useRef(false);
  const unsubRef   = useRef(null);

  // リアルタイム監視（ポーリング不要）
  useEffect(() => {
    unsubRef.current = watchRoom(room.code, (data) => {
      if (!data) {
        // ルーム削除 = 相手退出
        setOppLeft(true);
        return;
      }
      if (data.state && data.ver > verRef.current && !writingRef.current) {
        verRef.current = data.ver;
        setMpState(data.state);
      }
    });
    return () => { if (unsubRef.current) unsubRef.current(); };
  }, [room.code]);

  const write = useCallback(async (newState) => {
    writingRef.current = true;
    const nv = verRef.current + 1;
    verRef.current = nv;
    setMpState(newState);
    try {
      const data = await getRoom(room.code);
      await setRoom(room.code, { ...data, state: newState, ver: nv });
    } catch {}
    setTimeout(() => { writingRef.current = false; }, 100);
  }, [room.code]);

  const myKey  = room.role;
  const oppKey = room.role === "host" ? "guest" : "host";
  const isMyTurn = mpState && mpState.turn === myKey && mpState.phase !== "end";

  useEffect(() => {
    if (!mpState || !isMyTurn || mpState.phase !== "draw") return;
    const t = setTimeout(() => {
      const wall = mpState.wall;
      if (!wall.length) {
        write({ ...mpState, phase: "end", result: "draw", msg: "山が尽きました。引き分け。" });
        return;
      }
      const [drawn, ...rest] = wall;
      const myHand = mpState[`${myKey}Hand`];
      const h6 = [...myHand, drawn];
      if (chkWin(h6)) {
        const sets = chkWin(h6);
        const isFirst = !mpState.firstWinner;
        const myRiichi = mpState[`${myKey}Riichi`];
        const { pts, lines } = calcPts(sets, myRiichi, isFirst, mpState.dora);
        write({
          ...mpState, wall: rest,
          [`${myKey}Hand`]: h6,
          firstWinner: isFirst ? myKey : mpState.firstWinner,
          phase: "end", result: myKey,
          score: { ...mpState.score, [myKey]: mpState.score[myKey] + pts },
          matchWins: { ...mpState.matchWins, [myKey]: mpState.matchWins[myKey] + 1 },
          msg: `🎉 ${myKey === "host" ? "ホスト" : "ゲスト"}がツモ！ ${pts}点（${lines.join("・")}）`,
        });
        return;
      }
      if (mpState[`${myKey}Riichi`]) {
        write({
          ...mpState, wall: rest,
          [`${myKey}Discard`]: [...mpState[`${myKey}Discard`], drawn],
          phase: "draw", turn: oppKey,
          msg: "リーチ中。相手のターン",
        });
        return;
      }
      write({
        ...mpState, wall: rest,
        [`${myKey}Hand`]: h6,
        phase: "sel", msg: "ツモ。捨てる牌を選んでください。",
      });
      setSel(-1);
    }, 450);
    return () => clearTimeout(t);
  }, [mpState, isMyTurn, myKey, oppKey, write]);

  const doDiscard = () => {
    if (sel < 0 || !mpState || !isMyTurn || mpState.phase !== "sel") return;
    const myHand = mpState[`${myKey}Hand`];
    const h5 = myHand.filter((_, i) => i !== sel);
    const newDiscard = [...mpState[`${myKey}Discard`], myHand[sel]];
    if (tenpai(h5).length > 0) {
      write({
        ...mpState,
        [`${myKey}Hand`]: h5, [`${myKey}Discard`]: newDiscard,
        phase: "rq",
        msg: `聴牌！${myKey === "host" ? "ホスト" : "ゲスト"}がリーチ判断中…`,
      });
    } else {
      write({
        ...mpState,
        [`${myKey}Hand`]: h5, [`${myKey}Discard`]: newDiscard,
        phase: "draw", turn: oppKey, msg: "相手のターン",
      });
    }
    setSel(-1);
  };

  const declareRiichi = yes => {
    if (!mpState || !isMyTurn || mpState.phase !== "rq") return;
    write({
      ...mpState, [`${myKey}Riichi`]: yes,
      phase: "draw", turn: oppKey,
      msg: yes ? "⚡ リーチ宣言！相手のターン" : "相手のターン",
    });
  };

  const matchOver = mpState && (mpState.matchWins.host >= mpState.target || mpState.matchWins.guest >= mpState.target);
  const matchWinnerKey = mpState ? (mpState.matchWins.host >= mpState.target ? "host" : mpState.matchWins.guest >= mpState.target ? "guest" : null) : null;

  const onNext = () => {
    if (!mpState) return;
    if (matchOver) write(initMP({ target: mpState.target }));
    else write(initMP({
      score: mpState.score, target: mpState.target,
      firstWinner: mpState.firstWinner, matchWins: mpState.matchWins,
    }));
    setSel(-1);
  };

  const exit = async () => {
    try { await delRoom(room.code); } catch {}
    onExit();
  };

  if (oppLeft) {
    return (
      <div style={containerStyle}>
        <div style={{ marginTop: 60 }}><Title small /></div>
        <div style={{
          background: PANEL, border: `2px solid #f5705e88`,
          borderRadius: 14, padding: 24, marginTop: 24, textAlign: "center",
          maxWidth: 360,
        }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#f5705e", marginBottom: 8 }}>👋 相手が退出しました</div>
          <div style={{ color: "#c8e8c888", fontSize: 12 }}>対戦を終了します</div>
        </div>
        <button onClick={onExit} style={{
          marginTop: 20, padding: "12px 32px",
          background: GOLD, color: "#091509", border: "none",
          borderRadius: 9, fontWeight: 900, cursor: "pointer",
          letterSpacing: 3, fontFamily: "inherit",
        }}>メニューに戻る</button>
      </div>
    );
  }
  if (!mpState) {
    return (
      <div style={containerStyle}>
        <div style={{ marginTop: 60 }}><Title small /></div>
        <div style={{ marginTop: 20, color: GOLD, fontSize: 14 }}>同期中…</div>
      </div>
    );
  }

  const view = {
    pHand: mpState[`${myKey}Hand`],
    aHand: mpState[`${oppKey}Hand`],
    wall: mpState.wall, dora: mpState.dora,
    phase: !isMyTurn && mpState.phase !== "end" ? "wait"
         : mpState.phase === "draw" ? "draw"
         : mpState.phase === "sel"  ? "sel"
         : mpState.phase === "rq"   ? "rq" : "end",
    turn: "p",
    pRiichi: mpState[`${myKey}Riichi`],
    aRiichi: mpState[`${oppKey}Riichi`],
    pDiscard: mpState[`${myKey}Discard`],
    aDiscard: mpState[`${oppKey}Discard`],
    score: { p: mpState.score[myKey], a: mpState.score[oppKey] },
    matchWins: { p: mpState.matchWins[myKey], a: mpState.matchWins[oppKey] },
    target: mpState.target,
    msg: isMyTurn || mpState.phase === "end" ? mpState.msg : `🔄 相手のターン…`,
    result: mpState.result === myKey ? "p" : mpState.result === oppKey ? "a" : mpState.result,
  };
  const matchWinner = matchWinnerKey === myKey ? "p" : matchWinnerKey === oppKey ? "a" : null;

  return (
    <GameBoard
      g={view} sel={sel} setSel={setSel}
      doDiscard={doDiscard} declareRiichi={declareRiichi}
      onNext={onNext} onExit={exit}
      labels={{ me: "あなた", opp: room.role === "host" ? "ゲスト" : "ホスト", oppEmoji: "👤" }}
      mpInfo={{ code: room.code, role: room.role }}
      matchOver={matchOver} matchWinner={matchWinner}
    />
  );
}

function GameBoard({ g, sel, setSel, doDiscard, declareRiichi, onNext, onExit, labels, mpInfo, matchOver, matchWinner }) {
  const isDora = t => g.dora && t.suit === g.dora.suit && t.num === g.dora.num;
  const canPick = g.phase === "sel" && !g.pRiichi;
  const waits = (g.phase === "rq" || (g.pRiichi && g.phase !== "end")) ? tenpai(g.pHand) : [];

  return (
    <div style={containerStyle}>
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0, letterSpacing: 6, color: GOLD, textShadow: `0 0 40px ${GOLD}55, 0 2px 4px #000` }}>タイパ麻雀</h1>
        {mpInfo && (
          <div style={{ fontSize: 9, color: "#5ef57c66", letterSpacing: 2, marginTop: 4 }}>
            ROOM <span style={{ color: GOLD, fontFamily: "monospace", fontWeight: 900, letterSpacing: 3 }}>{mpInfo.code}</span> ／ {mpInfo.role === "host" ? "🎲 ホスト" : "🔑 ゲスト"}
          </div>
        )}
      </div>

      <div style={{
        background: PANEL, border: `1px solid ${GOLD}55`,
        borderRadius: 12, padding: "10px 28px", marginBottom: 12,
        display: "flex", gap: 28, alignItems: "center",
      }}>
        <PlayerScore name={labels.me} color="#5eb8f5" pts={g.score.p} wins={g.matchWins?.p ?? 0} target={g.target} />
        <div style={{ color: `${GOLD}44`, fontSize: 13, letterSpacing: 2 }}>VS</div>
        <PlayerScore name={labels.opp} color="#f5705e" pts={g.score.a} wins={g.matchWins?.a ?? 0} target={g.target} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 10 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 10, color: "#f5705e88", marginBottom: 4, letterSpacing: 1 }}>ドラ</div>
          <Tile tile={g.dora} />
        </div>
        <div style={{ width: 1, height: 48, background: `${GOLD}22` }} />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 10, color: "#c8e8c855", marginBottom: 2 }}>残り山</div>
          <div style={{ color: "#5ef57c", fontSize: 22, fontWeight: 700 }}>{g.wall.length}</div>
          <div style={{ fontSize: 9, color: "#c8e8c844" }}>枚</div>
        </div>
      </div>

      <div style={{ background: PANEL, border: `1px solid #f5705e33`, borderRadius: 12, padding: "12px 16px", width: "100%", maxWidth: 460, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontSize: 11, color: "#f5705e88", letterSpacing: 1 }}>
          <span>{labels.oppEmoji} {labels.opp}の手牌（{g.aHand.length}枚）</span>
          {g.aRiichi && <span style={{ color: "#f5705e", fontWeight: 900, fontSize: 11, background: "#f5705e22", padding: "1px 8px", borderRadius: 4 }}>⚡ REACH</span>}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {g.aHand.map(t => <Tile key={t.uid} tile={t} back={g.phase !== "end"} isDora={isDora(t)} />)}
        </div>
        <div style={{ fontSize: 10, color: "#f5705e33", marginTop: 6 }}>捨て牌 {g.aDiscard.length}枚</div>
      </div>

      <div style={{
        background: `${PANEL}cc`, border: `1px solid ${GOLD}44`,
        borderRadius: 8, padding: "9px 20px", marginBottom: 10,
        fontSize: 13, color: GOLD, textAlign: "center",
        width: "100%", maxWidth: 460, minHeight: 36,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>{g.msg}</div>

      <div style={{ background: PANEL, border: `1px solid #5eb8f533`, borderRadius: 12, padding: "12px 16px", width: "100%", maxWidth: 460, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontSize: 11, color: "#5eb8f588", letterSpacing: 1 }}>
          <span>🀄 {labels.me}の手牌（{g.pHand.length}枚）</span>
          {g.pRiichi && <span style={{ color: "#5eb8f5", fontWeight: 900, fontSize: 11, background: "#5eb8f522", padding: "1px 8px", borderRadius: 4 }}>⚡ REACH</span>}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingBottom: 10, minHeight: 78 }}>
          {g.pHand.map((t, i) => (
            <Tile key={t.uid} tile={t} sel={sel === i}
              isNew={i === g.pHand.length - 1 && g.phase === "sel" && !g.pRiichi}
              isDora={isDora(t)}
              onClick={canPick ? () => setSel(sel === i ? -1 : i) : undefined}
            />
          ))}
          {(g.phase === "draw" || g.phase === "wait") && (
            <div style={{ width: 46, height: 65, border: `2px dashed ${GOLD}44`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: `${GOLD}66`, fontSize: 18 }}>…</span>
            </div>
          )}
        </div>

        {waits.length > 0 && (
          <div style={{
            background: "#091509", border: `1px solid ${GOLD}33`,
            borderRadius: 8, padding: "6px 10px", marginBottom: 8,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontSize: 10, color: `${GOLD}aa`, letterSpacing: 2 }}>待ち</span>
            <div style={{ display: "flex", gap: 4 }}>
              {waits.map((w, i) => (
                <div key={i} style={{
                  background: SUIT_COLOR[w.suit] + "22",
                  border: `1px solid ${SUIT_COLOR[w.suit]}66`,
                  borderRadius: 4, padding: "2px 6px",
                  color: SUIT_COLOR[w.suit], fontSize: 11, fontWeight: 700,
                }}>{w.num}{w.suit}</div>
              ))}
            </div>
          </div>
        )}

        {canPick && (
          <button onClick={doDiscard} disabled={sel < 0}
            style={{
              width: "100%", padding: "10px 0",
              background: sel >= 0 ? GOLD : PANEL,
              color: sel >= 0 ? "#091509" : `${GOLD}44`,
              border: `1px solid ${sel >= 0 ? GOLD : GOLD + "44"}`,
              borderRadius: 8, fontSize: 14, fontWeight: 900,
              cursor: sel >= 0 ? "pointer" : "not-allowed",
              letterSpacing: 4, fontFamily: "inherit",
            }}
          >{sel >= 0 ? "捨てる" : "牌を選んでください"}</button>
        )}
        {g.phase === "sel" && g.pRiichi && (
          <div style={{ textAlign: "center", color: "#5eb8f588", fontSize: 12, padding: "6px 0" }}>リーチ中 — 自動処理しています…</div>
        )}
      </div>

      {g.phase === "rq" && (
        <div style={{
          background: PANEL, border: `2px solid ${GOLD}`,
          borderRadius: 14, padding: "18px 20px", textAlign: "center",
          width: "100%", maxWidth: 460, marginBottom: 10,
          boxShadow: `0 0 40px ${GOLD}33`,
        }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: GOLD, marginBottom: 6, letterSpacing: 2 }}>✨ 聴牌！</div>
          <div style={{ color: "#c8e8c888", fontSize: 12, marginBottom: 16, lineHeight: 1.7 }}>
            リーチ宣言で +1点／宣言後はツモ牌を自動捨て
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => declareRiichi(true)} style={{ flex: 2, padding: "11px 0", background: GOLD, color: "#091509", border: "none", borderRadius: 9, fontSize: 16, fontWeight: 900, cursor: "pointer", letterSpacing: 3, fontFamily: "inherit" }}>⚡ リーチ！（+1点）</button>
            <button onClick={() => declareRiichi(false)} style={{ flex: 1, padding: "11px 0", background: PANEL, color: "#c8e8c877", border: "1px solid #5ef57c33", borderRadius: 9, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>しない</button>
          </div>
        </div>
      )}

      {g.phase === "end" && (
        <div style={{
          background: PANEL,
          border: `2px solid ${matchOver ? GOLD : GOLD + "88"}`,
          borderRadius: 14, padding: "20px", textAlign: "center",
          width: "100%", maxWidth: 460, marginBottom: 10,
          boxShadow: matchOver ? `0 0 80px ${GOLD}88`
                                : `0 0 60px ${g.result === "p" ? "#5eb8f533" : g.result === "a" ? "#f5705e33" : "#88888833"}`,
        }}>
          {matchOver ? (
            <>
              <div style={{ fontSize: 12, color: `${GOLD}aa`, letterSpacing: 4, marginBottom: 4 }}>🏆 MATCH FINISHED</div>
              <div style={{
                fontSize: 30, fontWeight: 900, marginBottom: 14,
                color: matchWinner === "p" ? "#5eb8f5" : "#f5705e",
              }}>
                {matchWinner === "p" ? `${labels.me}の優勝！` : `${labels.opp}の優勝`}
              </div>
              <div style={{ color: "#c8e8c888", fontSize: 12, marginBottom: 6 }}>最終スコア</div>
              <div style={{ color: GOLD, fontSize: 18, fontWeight: 900, marginBottom: 16, fontFamily: "monospace" }}>
                {g.score.p} <span style={{ color: `${GOLD}44` }}>—</span> {g.score.a}
              </div>
              <button onClick={onNext} style={{
                width: "100%", padding: "12px 0",
                background: GOLD, color: "#091509", border: "none",
                borderRadius: 9, fontSize: 15, fontWeight: 900,
                cursor: "pointer", letterSpacing: 3, fontFamily: "inherit",
              }}>新しいマッチ</button>
            </>
          ) : (
            <>
              <div style={{
                fontSize: 24, fontWeight: 900, marginBottom: 10,
                color: g.result === "p" ? "#5eb8f5" : g.result === "a" ? "#f5705e" : "#c8e8c8",
              }}>
                {g.result === "p" ? `🎉 ${labels.me}の勝ち！` : g.result === "a" ? `😤 ${labels.opp}の勝ち` : "🤝 引き分け"}
              </div>
              {(g.result === "p" || g.result === "a") && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: "#c8e8c866", fontSize: 11, marginBottom: 8 }}>{g.result === "p" ? labels.me : labels.opp}の上がり手</div>
                  <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                    {(g.result === "p" ? g.pHand : g.aHand).map(t => <Tile key={t.uid} tile={t} isDora={isDora(t)} />)}
                  </div>
                </div>
              )}
              <div style={{ color: GOLD, fontSize: 13, marginBottom: 18 }}>{g.msg}</div>
              <button onClick={onNext} style={{
                width: "100%", padding: "12px 0",
                background: GOLD, color: "#091509", border: "none",
                borderRadius: 9, fontSize: 15, fontWeight: 900,
                cursor: "pointer", letterSpacing: 3, fontFamily: "inherit",
              }}>次のゲーム</button>
            </>
          )}
        </div>
      )}

      <button onClick={onExit} style={{
        marginTop: 10, padding: "8px 24px",
        background: "transparent", color: "#c8e8c844",
        border: `1px solid #5ef57c22`, borderRadius: 6, fontSize: 11,
        cursor: "pointer", letterSpacing: 2, fontFamily: "inherit",
      }}>← メニューに戻る</button>

      <div style={{ display: "flex", gap: 14, fontSize: 10, color: "#c8e8c855", marginTop: 16, flexWrap: "wrap", justifyContent: "center" }}>
        {SUITS.map(s => <span key={s} style={{ color: SUIT_COLOR[s] }}>● {s}</span>)}
        <span style={{ color: "#f5705e88" }}>★ ドラ</span>
        <span style={{ color: `${GOLD}88` }}>新 ツモ牌</span>
      </div>
    </div>
  );
}

function PlayerScore({ name, color, pts, wins, target }) {
  return (
    <div style={{ textAlign: "center", minWidth: 80 }}>
      <div style={{ color, fontSize: 11, letterSpacing: 2, marginBottom: 2 }}>{name}</div>
      <div style={{ color: GOLD, fontSize: 28, fontWeight: 900, lineHeight: 1 }}>{pts}</div>
      <div style={{ display: "flex", gap: 3, justifyContent: "center", marginTop: 4 }}>
        {Array.from({ length: target }).map((_, i) => (
          <div key={i} style={{
            width: 8, height: 8, borderRadius: "50%",
            background: i < wins ? color : "transparent",
            border: `1px solid ${i < wins ? color : color + "44"}`,
          }} />
        ))}
      </div>
    </div>
  );
}
