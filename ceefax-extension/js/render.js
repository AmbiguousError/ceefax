export const COLS = 40;
export const ROWS = 25;

const COLORS = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];

export function buildGrid(root) {
  root.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "teletext-grid";
  for (let i = 0; i < COLS * ROWS; i++) {
    const cell = document.createElement("span");
    cell.className = "cell fg-white";
    cell.textContent = " ";
    cell.dataset.row = String(Math.floor(i / COLS));
    cell.dataset.col = String(i % COLS);
    grid.appendChild(cell);
  }
  root.appendChild(grid);
  return grid;
}

export function renderPage(grid, pageData) {
  const cells = grid.children;
  for (let row = 0; row < ROWS; row++) {
    const runs = pageData.lines[row] || [];
    const rowChars = new Array(COLS).fill(" ");
    const rowColors = new Array(COLS).fill("white");
    let col = 0;
    for (const run of runs) {
      const color = COLORS.includes(run.color) ? run.color : "white";
      for (const ch of run.text) {
        if (col >= COLS) break;
        rowChars[col] = ch;
        rowColors[col] = color;
        col++;
      }
    }
    for (let c = 0; c < COLS; c++) {
      const cell = cells[row * COLS + c];
      cell.textContent = rowChars[c];
      cell.className = `cell fg-${rowColors[c]}`;
    }
  }
}
