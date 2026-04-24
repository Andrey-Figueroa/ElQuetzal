// ─── RELOJ ───────────────────────────────────────────────────────
function actualizarReloj() {
  const now = new Date();
  const fecha = now.toLocaleDateString("es-CR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  const hora = now.toLocaleTimeString("es-CR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const el = document.getElementById("fecha-hora");
  if (el) {
    // Capitalizar primera letra
    const texto = fecha.charAt(0).toUpperCase() + fecha.slice(1);
    el.textContent = `${texto} · ${hora}`;
  }
}

// ─── ANIMACIÓN DE ENTRADA (stagger) ─────────────────────────────
function animarCards() {
  const cards = document.querySelectorAll(".module-card");
  cards.forEach((card, i) => {
    card.style.opacity = "0";
    card.style.transform = "translateY(24px)";
    card.style.transition = "none";

    setTimeout(() => {
      card.style.transition = "opacity 0.4s ease, transform 0.4s ease";
      card.style.opacity = "";
      card.style.transform = "";
    }, 80 + i * 70);
  });
}

// ─── INIT ────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  actualizarReloj();
  setInterval(actualizarReloj, 30_000);
  animarCards();
});
