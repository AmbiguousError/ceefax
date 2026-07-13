import { buildGrid } from "./render.js";
import { initNav } from "./nav.js";

document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("app");
  const grid = buildGrid(root);
  initNav(grid);
});
