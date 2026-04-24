/**
 * intercambio.js — Módulo de Intercambio de Método de Pago — El Quetzal
 *
 * TABLA SUPABASE REQUERIDA (ejecutar en SQL Editor de Supabase):
 * ─────────────────────────────────────────────────────────────────
 * create table intercambios (
 *   id          text         primary key,
 *   fecha       timestamptz  default now() not null,
 *   tipo_entrada text        not null,
 *   monto_entrada numeric(12,2) not null default 0,
 *   tipo_salida  text        not null,
 *   monto_salida numeric(12,2) not null default 0,
 *   nota         text        default ''
 * );
 * ─────────────────────────────────────────────────────────────────
 */

// ─── SUPABASE ───────────────────────────────────────────────────
const SUPABASE_URL = "https://dfcmvelgksgjkryhdooe.supabase.co";
const SUPABASE_KEY = "sb_publishable_djehLvcT_gtZBlKMqzguBA_tu9F6_aA";
const HEADERS = {
  "Content-Type": "application/json",
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
};

// ─── ESTADO ─────────────────────────────────────────────────────
let métodoEntrada = "sinpe";
let métodoSalida  = "efectivo";

// ─── UTILIDADES ─────────────────────────────────────────────────
const fmt = (n) => "₡" + Number(n).toLocaleString("es-CR");
const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

const LABELS = { efectivo: "💵 Efectivo", sinpe: "📱 SINPE", tarjeta: "💳 Tarjeta" };

function inicioDeHoy() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d;
}
function inicioDeMañana() {
  const d = inicioDeHoy(); d.setDate(d.getDate() + 1); return d;
}
function formatHora(iso) {
  return new Date(iso).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" });
}

// ─── SELECCIÓN DE MÉTODO ────────────────────────────────────────
function seleccionarEntrada(metodo) {
  métodoEntrada = metodo;
  document.querySelectorAll("#selector-entrada .metodo-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.metodo === metodo);
  });
  actualizarPreview();
}

function seleccionarSalida(metodo) {
  métodoSalida = metodo;
  document.querySelectorAll("#selector-salida .metodo-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.metodo === metodo);
  });
  actualizarPreview();
}

// ─── PREVIEW ────────────────────────────────────────────────────
function actualizarPreview() {
  const entrada = parseFloat(document.getElementById("monto-entrada").value) || 0;
  const salida  = parseFloat(document.getElementById("monto-salida").value)  || 0;
  const el = document.getElementById("preview-texto");

  if (entrada === 0 && salida === 0) {
    el.textContent = "Ingresá los montos para ver el resumen";
    return;
  }

  const partes = [];
  if (entrada > 0)
    partes.push(`Recibí ${fmt(entrada)} por ${LABELS[métodoEntrada]}`);
  if (salida > 0)
    partes.push(`Entregué ${fmt(salida)} por ${LABELS[métodoSalida]}`);

  el.textContent = partes.join("  →  ");
}

// ─── VALIDAR ────────────────────────────────────────────────────
function validar() {
  const entrada = parseFloat(document.getElementById("monto-entrada").value) || 0;
  const salida  = parseFloat(document.getElementById("monto-salida").value)  || 0;
  const errorEl = document.getElementById("error-msg");

  if (métodoEntrada === métodoSalida) {
    mostrarError("El método de entrada y salida no pueden ser el mismo.");
    return false;
  }
  if (entrada <= 0) {
    mostrarError("El monto recibido debe ser mayor que ₡0.");
    return false;
  }
  if (salida <= 0) {
    mostrarError("El monto entregado debe ser mayor que ₡0.");
    return false;
  }
  errorEl.style.display = "none";
  return true;
}

function mostrarError(msg) {
  const el = document.getElementById("error-msg");
  el.textContent = "⚠️ " + msg;
  el.style.display = "block";
}

// ─── API ─────────────────────────────────────────────────────────
async function apiGuardarIntercambio(payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/intercambios`, {
    method: "POST",
    headers: { ...HEADERS, Prefer: "return=minimal" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase ${res.status}: ${txt}`);
  }
}

async function apiGetIntercambiosHoy() {
  const desde = inicioDeHoy().toISOString();
  const hasta = inicioDeMañana().toISOString();
  const url =
    `${SUPABASE_URL}/rest/v1/intercambios` +
    `?fecha=gte.${encodeURIComponent(desde)}` +
    `&fecha=lt.${encodeURIComponent(hasta)}` +
    `&select=*&order=fecha.desc`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return res.json();
}

// ─── GUARDAR ─────────────────────────────────────────────────────
async function guardarIntercambio() {
  if (!validar()) return;

  const btn = document.getElementById("btn-guardar");
  btn.disabled = true;
  btn.textContent = "Guardando…";

  const payload = {
    id: generateId(),
    tipo_entrada: métodoEntrada,
    monto_entrada: parseFloat(document.getElementById("monto-entrada").value),
    tipo_salida: métodoSalida,
    monto_salida: parseFloat(document.getElementById("monto-salida").value),
    nota: document.getElementById("nota-intercambio").value.trim(),
  };

  try {
    await apiGuardarIntercambio(payload);

    // Limpiar formulario
    document.getElementById("monto-entrada").value = "";
    document.getElementById("monto-salida").value = "";
    document.getElementById("nota-intercambio").value = "";
    actualizarPreview();
    seleccionarEntrada("sinpe");
    seleccionarSalida("efectivo");

    showToast("✅ Intercambio registrado");
    cargarHistorial(); // Recargar historial
  } catch (err) {
    mostrarError("Error al guardar: " + err.message);
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = "⇄ Registrar Intercambio";
  }
}

// ─── HISTORIAL ───────────────────────────────────────────────────
async function cargarHistorial() {
  const loadEl  = document.getElementById("historial-loading");
  const wrapEl  = document.getElementById("historial-wrap");
  const vacioEl = document.getElementById("historial-vacio");
  const badge   = document.getElementById("badge-historial");

  loadEl.style.display  = "flex";
  wrapEl.style.display  = "none";
  vacioEl.style.display = "none";

  try {
    const lista = await apiGetIntercambiosHoy();
    badge.textContent = `${lista.length} ${lista.length === 1 ? "registro" : "registros"}`;

    if (!lista.length) {
      vacioEl.style.display = "flex";
    } else {
      const tbody = document.getElementById("historial-list");
      tbody.innerHTML = lista
        .map(
          (i) => `
        <tr>
          <td style="color:var(--muted);font-size:13px;white-space:nowrap;">${formatHora(i.fecha)}</td>
          <td>${LABELS[i.tipo_entrada]} <strong>${fmt(i.monto_entrada)}</strong></td>
          <td>${LABELS[i.tipo_salida]} <strong>${fmt(i.monto_salida)}</strong></td>
          <td style="color:var(--muted);font-size:13px;">${i.nota || "—"}</td>
        </tr>`,
        )
        .join("");
      wrapEl.style.display = "";
    }
  } catch (err) {
    vacioEl.style.display = "flex";
    vacioEl.querySelector("p").textContent = "Error al cargar historial: " + err.message;
    console.error(err);
  } finally {
    loadEl.style.display = "none";
  }
}

// ─── TOAST ───────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove("show"), 2800);
}

// ─── INIT ────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  cargarHistorial();
});
