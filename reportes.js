/**
 * reportes.js — Histórico Filtrable — El Quetzal
 * Consulta ventas e intercambios por rango de fechas desde Supabase.
 */

// ─── SUPABASE ───────────────────────────────────────────────────
const SUPABASE_URL = "https://dfcmvelgksgjkryhdooe.supabase.co";
const SUPABASE_KEY = "sb_publishable_djehLvcT_gtZBlKMqzguBA_tu9F6_aA";
const HEADERS = {
  "Content-Type": "application/json",
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
};

// ─── UTILIDADES ─────────────────────────────────────────────────
const fmt = (n) => "₡" + Number(n).toLocaleString("es-CR");

function formatFecha(iso) {
  return new Date(iso).toLocaleDateString("es-CR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}
function formatHora(iso) {
  return new Date(iso).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" });
}

const LABELS_METODO = {
  efectivo: "💵 Efectivo", sinpe: "📱 SINPE", tarjeta: "💳 Tarjeta",
  "efectivo+sinpe": "💵📱 Mix", "efectivo+tarjeta": "💵💳 Mix",
  "sinpe+tarjeta": "📱💳 Mix", "efectivo+sinpe+tarjeta": "💵📱💳 Mix",
};
function labelMetodo(v) {
  // Ventas tienen metodo_pago; intercambios usamos los campos tipo_entrada/tipo_salida
  if (v._tipo === "intercambio") {
    return LABELS_METODO[v.tipo_entrada] + " → " + LABELS_METODO[v.tipo_salida];
  }
  return LABELS_METODO[v.metodo_pago] || v.metodo_pago || "—";
}

function iconosMetodo(v) {
  const p = [];
  if ((v.monto_efectivo || 0) > 0) p.push("💵");
  if ((v.monto_tarjeta || 0) > 0) p.push("💳");
  if ((v.monto_sinpe || 0) > 0) p.push("📱");
  return p.join(" ") || "—";
}

function resumenItems(items = []) {
  if (!items.length) return "—";
  if (items.length <= 2) return items.map((i) => i.nombre).join(", ");
  return items.slice(0, 2).map((i) => i.nombre).join(", ") + ` +${items.length - 2} más`;
}

// ─── PERÍODOS RÁPIDOS ───────────────────────────────────────────
function toLocalISODate(d) {
  return d.toLocaleDateString("sv-SE"); // "YYYY-MM-DD" en local
}

function setPeriodo(periodo) {
  const hoy = new Date();
  let desde, hasta;

  if (periodo === "hoy") {
    desde = hasta = toLocalISODate(hoy);
  } else if (periodo === "semana") {
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    desde = toLocalISODate(lunes);
    hasta = toLocalISODate(hoy);
  } else if (periodo === "mes") {
    const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    desde = toLocalISODate(primero);
    hasta = toLocalISODate(hoy);
  } else if (periodo === "mes-anterior") {
    const primero = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const ultimo  = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
    desde = toLocalISODate(primero);
    hasta = toLocalISODate(ultimo);
  }

  document.getElementById("fecha-desde").value = desde;
  document.getElementById("fecha-hasta").value = hasta;
  consultar();
}

// ─── API ─────────────────────────────────────────────────────────
async function fetchVentasPeriodo(desde, hasta) {
  const url =
    `${SUPABASE_URL}/rest/v1/ventas` +
    `?fecha=gte.${encodeURIComponent(desde + "T00:00:00")}` +
    `&fecha=lte.${encodeURIComponent(hasta + "T23:59:59")}` +
    `&select=*&order=fecha.desc`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase ventas ${res.status}`);
  return res.json();
}

async function fetchIntercambiosPeriodo(desde, hasta) {
  const url =
    `${SUPABASE_URL}/rest/v1/intercambios` +
    `?fecha=gte.${encodeURIComponent(desde + "T00:00:00")}` +
    `&fecha=lte.${encodeURIComponent(hasta + "T23:59:59")}` +
    `&select=*&order=fecha.desc`;
  const res = await fetch(url, { headers: HEADERS });
  if (res.status === 404 || res.status === 400) return []; // tabla no existe aún
  if (!res.ok) throw new Error(`Supabase intercambios ${res.status}`);
  return res.json();
}

// ─── CÁLCULO KPIs ───────────────────────────────────────────────
function calcularResumen(ventas) {
  return ventas.reduce(
    (acc, v) => {
      const totalVenta = v.total || 0;
      acc.total += totalVenta;
      acc.count++;

      let costoVenta = 0;
      if (v.items && Array.isArray(v.items)) {
        v.items.forEach((item) => {
          costoVenta += (parseFloat(item.pcosto) || 0) * (parseFloat(item.cantidad) || 0);
        });
      }

      const utilidadVenta = totalVenta - costoVenta;
      acc.costo    += costoVenta;
      acc.utilidad += utilidadVenta;

      const ef = v.monto_efectivo || 0;
      const tj = v.monto_tarjeta  || 0;
      const si = v.monto_sinpe    || 0;
      const sum = ef + tj + si;

      acc.efectivo += ef;
      acc.tarjeta  += tj;
      acc.sinpe    += si;

      if (sum > 0) {
        acc.efectivoUtilidad += utilidadVenta * (ef / sum);
        acc.efectivoCosto    += costoVenta * (ef / sum);
        acc.tarjetaUtilidad  += utilidadVenta * (tj / sum);
        acc.tarjetaCosto     += costoVenta * (tj / sum);
        acc.sinpeUtilidad    += utilidadVenta * (si / sum);
        acc.sinpeCosto       += costoVenta * (si / sum);
      }
      return acc;
    },
    {
      total: 0, costo: 0, utilidad: 0, count: 0,
      efectivo: 0, efectivoUtilidad: 0, efectivoCosto: 0,
      tarjeta: 0, tarjetaUtilidad: 0, tarjetaCosto: 0,
      sinpe: 0, sinpeUtilidad: 0, sinpeCosto: 0,
    },
  );
}

// ─── RENDER KPIs ────────────────────────────────────────────────
function renderKPIs(r) {
  document.getElementById("kpi-total").textContent    = fmt(r.total);
  document.getElementById("kpi-costo").textContent    = fmt(r.costo);
  document.getElementById("kpi-utilidad").textContent = fmt(r.utilidad);
  document.getElementById("kpi-count").textContent    = r.count;
  document.getElementById("kpi-count-sub").textContent =
    r.count === 1 ? "transacción" : "transacciones";

  document.getElementById("kpi-efectivo").textContent   = fmt(r.efectivo);
  document.getElementById("kpi-efectivo-u").textContent = `✨ ${fmt(r.efectivoUtilidad)}`;
  document.getElementById("kpi-efectivo-c").textContent = `📦 ${fmt(r.efectivoCosto)}`;

  document.getElementById("kpi-tarjeta").textContent   = fmt(r.tarjeta);
  document.getElementById("kpi-tarjeta-u").textContent = `✨ ${fmt(r.tarjetaUtilidad)}`;
  document.getElementById("kpi-tarjeta-c").textContent = `📦 ${fmt(r.tarjetaCosto)}`;

  document.getElementById("kpi-sinpe").textContent   = fmt(r.sinpe);
  document.getElementById("kpi-sinpe-u").textContent = `✨ ${fmt(r.sinpeUtilidad)}`;
  document.getElementById("kpi-sinpe-c").textContent = `📦 ${fmt(r.sinpeCosto)}`;

  if (r.total > 0) {
    document.getElementById("bar-efectivo").style.width = ((r.efectivo / r.total) * 100).toFixed(1) + "%";
    document.getElementById("bar-tarjeta").style.width  = ((r.tarjeta  / r.total) * 100).toFixed(1) + "%";
    document.getElementById("bar-sinpe").style.width    = ((r.sinpe    / r.total) * 100).toFixed(1) + "%";
  }
}

// ─── RENDER TABLA ───────────────────────────────────────────────
function renderTabla(ventas, intercambios) {
  const wrapEl      = document.getElementById("table-wrap");
  const vacioEl     = document.getElementById("estado-vacio");
  const badge       = document.getElementById("badge-count");
  const tbody       = document.getElementById("hist-body");

  // Combinar y ordenar por fecha desc
  const ventasTagged       = ventas.map((v)       => ({ ...v, _tipo: "venta" }));
  const intercambiosTagged = intercambios.map((i) => ({ ...i, _tipo: "intercambio" }));
  const todos = [...ventasTagged, ...intercambiosTagged]
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  badge.textContent = `${todos.length} ${todos.length === 1 ? "registro" : "registros"}`;

  if (!todos.length) {
    wrapEl.style.display  = "none";
    vacioEl.style.display = "flex";
    return;
  }

  wrapEl.style.display  = "";
  vacioEl.style.display = "none";

  tbody.innerHTML = todos
    .map((row) => {
      if (row._tipo === "venta") {
        return `
          <tr>
            <td class="td-fecha">${formatFecha(row.fecha)}</td>
            <td class="td-hora">${formatHora(row.fecha)}</td>
            <td class="td-tipo"><span class="badge-venta">Venta</span></td>
            <td>${resumenItems(row.items)}</td>
            <td>${iconosMetodo(row)}</td>
            <td class="td-monto">${fmt(row.total)}</td>
            <td style="font-size:12px;color:var(--muted);">Venta</td>
          </tr>`;
      } else {
        // Intercambio
        const entrada = LABELS_METODO[row.tipo_entrada] || row.tipo_entrada;
        const salida  = LABELS_METODO[row.tipo_salida]  || row.tipo_salida;
        return `
          <tr>
            <td class="td-fecha">${formatFecha(row.fecha)}</td>
            <td class="td-hora">${formatHora(row.fecha)}</td>
            <td class="td-tipo"><span class="badge-intercambio">Intercambio</span></td>
            <td style="font-size:12px;">${row.nota || `${entrada} → ${salida}`}</td>
            <td style="font-size:12px;">${entrada} → ${salida}</td>
            <td class="td-monto" style="color:var(--muted);">—</td>
            <td style="font-size:12px;color:var(--muted);">Intercambio</td>
          </tr>`;
      }
    })
    .join("");
}

// ─── CONSULTAR ──────────────────────────────────────────────────
async function consultar() {
  const desde = document.getElementById("fecha-desde").value;
  const hasta = document.getElementById("fecha-hasta").value;

  if (!desde || !hasta) {
    alert("Seleccioná ambas fechas para consultar.");
    return;
  }
  if (desde > hasta) {
    alert("La fecha 'Desde' no puede ser mayor que la fecha 'Hasta'.");
    return;
  }

  // UI loading
  const inicialEl  = document.getElementById("estado-inicial");
  const cargaEl    = document.getElementById("estado-carga");
  const contenidoEl = document.getElementById("contenido");
  const btn = document.getElementById("btn-consultar");

  inicialEl.style.display   = "none";
  contenidoEl.style.display = "none";
  cargaEl.style.display     = "flex";
  btn.disabled = true;

  try {
    const [ventas, intercambios] = await Promise.all([
      fetchVentasPeriodo(desde, hasta),
      fetchIntercambiosPeriodo(desde, hasta),
    ]);

    const resumen = calcularResumen(ventas);
    renderKPIs(resumen);
    renderTabla(ventas, intercambios);

    // Banner período
    const desdeLabel = formatFecha(desde + "T00:00:00");
    const hastaLabel = formatFecha(hasta + "T23:59:59");
    document.getElementById("periodo-banner").textContent =
      desde === hasta
        ? `📅 Resultados para ${desdeLabel}`
        : `📅 Período: ${desdeLabel} al ${hastaLabel}`;

    cargaEl.style.display     = "none";
    contenidoEl.style.display = "";
  } catch (err) {
    cargaEl.innerHTML = `
      <div style="font-size:32px">⚠️</div>
      <p style="color:#f87171">Error al consultar: ${err.message}</p>
      <button onclick="location.reload()" style="margin-top:12px;padding:8px 20px;
        border-radius:20px;border:1px solid rgba(248,113,113,0.4);
        background:rgba(248,113,113,0.1);color:#f87171;cursor:pointer;font-size:13px;">
        Reintentar
      </button>`;
    console.error(err);
  } finally {
    btn.disabled = false;
  }
}

// ─── INIT ────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Setear "hoy" como fechas por defecto
  const hoy = toLocalISODate(new Date());
  document.getElementById("fecha-desde").value = hoy;
  document.getElementById("fecha-hasta").value  = hoy;
});
