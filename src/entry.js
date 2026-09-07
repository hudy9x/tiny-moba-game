import { eyes, hats, shoes } from "./costume.js";
import "./style.css";
import "./menu.css";
import { MenuPreview } from "./menuPreview.js";
import { maps } from "./maps/registry.js";

const app = document.querySelector("#app");
app.hidden = true;
const menu = document.createElement("main");
menu.className = "game-menu";
document.body.append(menu);
const backdrop = document.createElement("div");
backdrop.className = "menu-scene";
menu.append(backdrop);
const overlay = document.createElement("div");
overlay.className = "menu-overlay";
menu.append(overlay);
const livePreview = new MenuPreview(backdrop);
let roomName = "friends";
let step = 0;
let explorerName = localStorage.getItem("little-world-name") || "";
const options = entries => Object.entries(entries).map(([value,label]) => `<option value="${value}">${label}</option>`).join("");
let saved = {};
try {
  saved = JSON.parse(sessionStorage.getItem("little-world-outfit") || "{}");
} catch {}
const outfit = {
  skin: "pip",
  color: "#f2684a",
  eye: "round",
  hat: "none",
  shoes: "classic",
  ...saved,
};
let mode = new URLSearchParams(location.search).get("mode") || "battle",
  mapId = new URLSearchParams(location.search).get("map") || "winter";
if (!maps.some((m) => m.id === mapId)) mapId = "winter";
if (!["battle", "training", "gem"].includes(mode)) mode = "battle";
function render() {
  livePreview.show(mapId, outfit, step === 1);
  overlay.innerHTML = `<a class="brand" href="/">▧ little world.</a><div class="menu-panel"><p class="eyebrow">${["YOUR NEXT LITTLE ADVENTURE", "01 / YOUR EXPLORER", "02 / YOUR DESTINATION"][step]}</p><h1>${["A world of possibilities.", "Make yourself at home.", "Where shall we go?"][step]}</h1><div id="menu-content"></div><div class="menu-actions">${step ? '<button id="back">Back</button>' : ""}<button id="next" class="primary">${["Start game", "Choose map", "Enter world"][step]}</button></div></div>`;
  const content = menu.querySelector("#menu-content");
  if (step === 0) {
    content.innerHTML =
      '<label>Your name<input id="explorer-name" maxlength="20" required placeholder="Explorer name" autocomplete="nickname"></label><p>Pick your pace. Bring a friend, or take on the arena.</p><div class="mode-list"></div>';
    const nameInput=content.querySelector("#explorer-name");nameInput.value=explorerName;nameInput.oninput=()=>{explorerName=nameInput.value;};
    for (const [id, name, desc] of [
      ["battle", "Bot battle", "A moving opponent that fights back."],
      ["training", "Training", "An idle target for practicing your skills."],
      ["gem", "Gem Grab", "Share a room with friends for 3v3 gems."],
    ]) {
      const b = document.createElement("button");
      b.className = "choice";
      b.classList.toggle("selected", id === mode);
      b.innerHTML = `<strong>${name}</strong><span>${desc}</span>`;
      b.onclick = () => {
        mode = id;
        render();
      };
      content.querySelector(".mode-list").append(b);
    }
  } else if (step === 1) {
    content.innerHTML = `<div class="outfit-layout"><div class="outfit-fields"><label>Character<select id="skin"><option value="pip">Pip</option><option value="sprout">Sprout</option></select></label><label>Costume color<input id="color" type="color"></label><label>Eyes<select id="eye">${options(eyes)}</select></label><label>Hat<select id="hat">${options(hats)}</select></label><label>Shoes<select id="shoes">${options(shoes)}</select></label></div></div>`;
    for (const key of ["skin", "color", "eye", "hat", "shoes"]) {
      const input = content.querySelector("#" + key);
      input.value = outfit[key];
      input.oninput = () => {
        outfit[key] = input.value;
        livePreview.show(mapId, outfit, true);
      };
    }
    livePreview.show(mapId, outfit, true);
  } else {
    content.innerHTML =
      '<div class="map-list"></div><label>Room name <input id="room" maxlength="32" value="friends" pattern="[a-zA-Z0-9_-]{1,32}"></label><p>Friends join by choosing the same mode, map, and room.</p>';
    content.querySelector("#room").value = roomName;
    content.querySelector("#room").oninput = (e) => {
      roomName = e.target.value;
    };
    for (const map of maps) {
      const b = document.createElement("button");
      b.className = "choice";
      b.classList.toggle("selected", map.id === mapId);
      b.innerHTML = `<strong>${map.name}</strong><span>${map.biome}</span>`;
      b.style.borderTop = `6px solid ${map.palette.land[0]}`;
      b.onclick = () => {
        mapId = map.id;
        render();
      };
      content.querySelector(".map-list").append(b);
    }
  }
  menu.querySelector("#back")?.addEventListener("click", () => {
    step--;
    render();
  });
  menu.querySelector("#next").onclick = async () => {
    if(step===0) {
      const input=menu.querySelector("#explorer-name");
      input.setCustomValidity(explorerName.trim() ? "" : "Please enter your explorer name.");
      if(!input.reportValidity())return;
      explorerName=explorerName.trim();localStorage.setItem("little-world-name",explorerName);
    }
    if (step < 2) {
      step++;
      render();
      return;
    }
    const room = menu.querySelector("#room");
    if (!room.checkValidity()) {
      room.reportValidity();
      return;
    }
    const url = new URL(location.href);
    url.searchParams.set("map", mapId);
    url.searchParams.set("mode", mode);
    url.searchParams.set("room", room.value);
    history.replaceState(null, "", url);
    sessionStorage.setItem("little-world-outfit", JSON.stringify(outfit));
    livePreview.dispose();
    menu.remove();
    app.hidden = false;
    await import("./main.js");
  };
}
render();
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    livePreview.dispose();
    menu.remove();
  });
