// 플레이어 색 칠하기: 회색 마스크(지붕·깃발·받침·동전 테두리)의 밝기로 플레이어 색을 밝히거나 어둡게 칠하고, 그 아래에 원래 그림을 깐다.
// 마스크 회색이 TINT_MID면 플레이어 색 그대로다. 곱하기만 하면 어두운 회색(약 100)에서 색이 탁해진다.
export const TINT_MID = 112;
export function tint(base, team, color) {
  const canvas = document.createElement('canvas');
  canvas.width = base.width;
  canvas.height = base.height;
  const g = canvas.getContext('2d');
  g.drawImage(team, 0, 0);
  const image = g.getImageData(0, 0, canvas.width, canvas.height);
  const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
  for (let i = 0; i < image.data.length; i += 4) {
    const light = image.data[i] / TINT_MID;
    for (let c = 0; c < 3; c++) image.data[i + c] = rgb[c] * light;
  }
  g.putImageData(image, 0, 0);
  g.globalCompositeOperation = 'destination-over';
  g.drawImage(base, 0, 0);
  return canvas;
}
