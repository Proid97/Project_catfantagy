// 시야와 안개 규칙(docs/game-design.md 3장 "시야와 안개"). 화면과 따로 두어 봇·온라인 대전도 같은 판정을 쓴다.
import { hexDistance } from './board.js';

// 육지 칸마다 보는 쪽에서의 단계
export const UNKNOWN = 0; // 모름: 바닥만 보인다
export const KNOWN = 1; // 앎: 오브젝트와 숫자도 보인다. 상대 말은 안 보인다
export const VISIBLE = 2; // 봄: 모두 보인다

// 말이 보는 거리. 말이 붙은 칸(왕성·마을은 꼭짓점의 세 칸, 길은 변 양쪽 두 칸, 유닛은 선 칸)에서 몇 칸까지 보는지.
// 마을·길은 붙은 칸만 본다(합의). 임시: 왕성은 붙은 세 칸과 그 이웃, 유닛은 2칸.
export const SIGHT = { castle: 1, village: 0, road: 0, unit: 2 };

export const tileKey = ({ q, r }) => `${q},${r}`;

// 지금 판에 있는 말. 아직 왕성뿐이다. 말은 { player, kind, hexes }.
export const boardPieces = board => board.starts.map(({ player, hexes }) => ({ player, kind: 'castle', hexes }));

// 처음부터 아는 칸: 교환소 칸과 숫자 6·8 칸
export const startKnown = board => new Set([...board.ports, ...board.tiles.filter(t => t.number === 6 || t.number === 8)].map(tileKey));

// viewer 쪽(팀전은 팀원과 함께, 1대1·개인전은 자기만)이 보는 판. known은 지난번까지 아는 칸이고 바꾸지 않는다.
// state: 칸 key → 단계, known: 이번에 본 칸까지 더한 아는 칸(다음 계산에 넘긴다).
export function vision(board, { viewer = 0, pieces = boardPieces(board), known = startKnown(board) } = {}) {
  const team = board.starts[viewer].team;
  const mine = pieces.filter(piece => board.starts[piece.player].team === team);
  const seen = board.tiles.filter(tile => mine.some(({ kind, hexes }) => hexes.some(h => hexDistance(h, tile) <= SIGHT[kind])));
  const visible = new Set(seen.map(tileKey));
  const state = new Map(board.tiles.map(tile => {
    const key = tileKey(tile);
    return [key, visible.has(key) ? VISIBLE : known.has(key) ? KNOWN : UNKNOWN];
  }));
  return { state, known: new Set([...known, ...visible]) };
}

// 말이 붙은 칸 중 하나라도 지금 보이면 그 말이 보인다.
export const pieceSeen = (state, hexes) => hexes.some(h => state.get(tileKey(h)) === VISIBLE);
