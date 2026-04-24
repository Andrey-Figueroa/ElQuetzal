/**
 * cierre.js — Dashboard Diario El Quetzal
 * Lee las ventas e intercambios de HOY desde Supabase.
 * Permite el cierre diario: envía email via n8n webhook y abre Tally.
 */

// ─── SUPABASE ───────────────────────────────────────────────────
const SUPABASE_URL = "https://dfcmvelgksgjkryhdooe.supabase.co";
const SUPABASE_KEY = "sb_publishable_djehLvcT_gtZBlKMqzguBA_tu9F6_aA";
const HEADERS = {
  "Content-Type": "application/json",
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
};

// ─── N8N WEBHOOK ────────────────────────────────────────────────
// Recibe el payload y envía el email vía Gmail en n8n
const N8N_WEBHOOK_URL = "https://neuralopmic.app.n8n.cloud/webhook/correoquetzal";

// URL Tally para el arqueo de caja
const TALLY_URL = "https://tally.so/r/Y5MeRB";

// ─── ESTADO GLOBAL ──────────────────────────────────────────────
let _ventasSnapshot = [];
let _resumenSnapshot = null;
let _intercambiosSnapshot = [];

// ─── UTILIDADES ─────────────────────────────────────────────────
const fmt = (n) => "₡" + Number(n).toLocaleString("es-CR");

function inicioDeHoy() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function inicioDeMañana() {
  const d = inicioDeHoy();
  d.setDate(d.getDate() + 1);
  return d;
}

function formatHora(fechaISO) {
  return new Date(fechaISO).toLocaleTimeString("es-CR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function iconosMetodo(v) {
  const partes = [];
  if ((v.monto_efectivo || 0) > 0) partes.push("💵");
  if ((v.monto_tarjeta || 0) > 0) partes.push("💳");
  if ((v.monto_sinpe || 0) > 0) partes.push("📱");
  return partes.join(" ") || "—";
}

function labelMetodo(key) {
  return { efectivo: "💵 Efectivo", sinpe: "📱 SINPE", tarjeta: "💳 Tarjeta" }[key] || key;
}

function resumenItems(items = []) {
  if (!items.length) return "—";
  if (items.length <= 2) return items.map((i) => i.nombre).join(", ");
  return (
    items
      .slice(0, 2)
      .map((i) => i.nombre)
      .join(", ") + ` +${items.length - 2} más`
  );
}

// ─── API — VENTAS ───────────────────────────────────────────────
async function fetchVentasDeHoy() {
  const desde = inicioDeHoy().toISOString();
  const hasta = inicioDeMañana().toISOString();

  const url =
    `${SUPABASE_URL}/rest/v1/ventas` +
    `?fecha=gte.${encodeURIComponent(desde)}` +
    `&fecha=lt.${encodeURIComponent(hasta)}` +
    `&select=*&order=fecha.desc`;

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase error ${res.status}`);
  return res.json();
}

// ─── API — INTERCAMBIOS ─────────────────────────────────────────
async function fetchIntercambiosDeHoy() {
  const desde = inicioDeHoy().toISOString();
  const hasta = inicioDeMañana().toISOString();

  const url =
    `${SUPABASE_URL}/rest/v1/intercambios` +
    `?fecha=gte.${encodeURIComponent(desde)}` +
    `&fecha=lt.${encodeURIComponent(hasta)}` +
    `&select=*&order=fecha.desc`;

  const res = await fetch(url, { headers: HEADERS });
  if (res.status === 404 || res.status === 400) return [];
  if (!res.ok) throw new Error(`Supabase intercambios error ${res.status}`);
  return res.json();
}

// ─── CALCULAR KPIs ──────────────────────────────────────────────
function calcularResumen(ventas) {
  return ventas.reduce(
    (acc, v) => {
      const totalVenta = v.total || 0;
      acc.total += totalVenta;
      acc.count++;

      let costoVenta = 0;
      if (v.items && Array.isArray(v.items)) {
        v.items.forEach((item) => {
          const costoItem = parseFloat(item.pcosto) || 0;
          const cantItem = parseFloat(item.cantidad) || 0;
          costoVenta += costoItem * cantItem;
        });
      }

      const utilidadVenta = totalVenta - costoVenta;
      acc.costo += costoVenta;
      acc.utilidad += utilidadVenta;

      const ef = v.monto_efectivo || 0;
      const tj = v.monto_tarjeta || 0;
      const si = v.monto_sinpe || 0;
      const sumMetodos = ef + tj + si;

      acc.efectivo += ef;
      acc.tarjeta += tj;
      acc.sinpe += si;

      if (sumMetodos > 0) {
        const ratioEf = ef / sumMetodos;
        const ratioTj = tj / sumMetodos;
        const ratioSi = si / sumMetodos;

        acc.efectivoUtilidad += utilidadVenta * ratioEf;
        acc.efectivoCosto += costoVenta * ratioEf;

        acc.tarjetaUtilidad += utilidadVenta * ratioTj;
        acc.tarjetaCosto += costoVenta * ratioTj;

        acc.sinpeUtilidad += utilidadVenta * ratioSi;
        acc.sinpeCosto += costoVenta * ratioSi;
      }

      return acc;
    },
    {
      total: 0, costo: 0, utilidad: 0, count: 0,
      efectivo: 0, efectivoCosto: 0, efectivoUtilidad: 0,
      tarjeta: 0, tarjetaCosto: 0, tarjetaUtilidad: 0,
      sinpe: 0, sinpeCosto: 0, sinpeUtilidad: 0,
    },
  );
}

// ─── RENDER KPIs ────────────────────────────────────────────────
function renderKPIs(r) {
  document.getElementById("kpi-total").textContent = fmt(r.total);
  document.getElementById("kpi-costo").textContent = fmt(r.costo);
  document.getElementById("kpi-utilidad").textContent = fmt(r.utilidad);

  document.getElementById("kpi-count").textContent = r.count;
  document.getElementById("kpi-count-sub").textContent =
    r.count === 1 ? "transacción" : "transacciones";

  document.getElementById("kpi-efectivo").textContent = fmt(r.efectivo);
  document.getElementById("kpi-efectivo-utilidad").textContent = `✨ ${fmt(r.efectivoUtilidad)}`;
  document.getElementById("kpi-efectivo-costo").textContent = `📦 ${fmt(r.efectivoCosto)}`;

  document.getElementById("kpi-tarjeta").textContent = fmt(r.tarjeta);
  document.getElementById("kpi-tarjeta-utilidad").textContent = `✨ ${fmt(r.tarjetaUtilidad)}`;
  document.getElementById("kpi-tarjeta-costo").textContent = `📦 ${fmt(r.tarjetaCosto)}`;

  document.getElementById("kpi-sinpe").textContent = fmt(r.sinpe);
  document.getElementById("kpi-sinpe-utilidad").textContent = `✨ ${fmt(r.sinpeUtilidad)}`;
  document.getElementById("kpi-sinpe-costo").textContent = `📦 ${fmt(r.sinpeCosto)}`;

  if (r.total > 0) {
    document.getElementById("bar-efectivo").style.width =
      ((r.efectivo / r.total) * 100).toFixed(1) + "%";
    document.getElementById("bar-tarjeta").style.width =
      ((r.tarjeta / r.total) * 100).toFixed(1) + "%";
    document.getElementById("bar-sinpe").style.width =
      ((r.sinpe / r.total) * 100).toFixed(1) + "%";
  }
}

// ─── RENDER TABLA VENTAS ────────────────────────────────────────
function renderTabla(ventas) {
  const tbody = document.getElementById("ventas-list");
  const vacio = document.getElementById("estado-vacio");
  const tableWrap = document.querySelector(".table-wrap");
  const badge = document.getElementById("badge-count");

  badge.textContent = `${ventas.length} ${ventas.length === 1 ? "transacción" : "transacciones"}`;

  if (!ventas.length) {
    tableWrap.style.display = "none";
    vacio.style.display = "flex";
    return;
  }

  tableWrap.style.display = "";
  vacio.style.display = "none";

  tbody.innerHTML = ventas
    .map(
      (v) => `
    <tr>
      <td class="td-hora">${formatHora(v.fecha)}</td>
      <td class="td-items">${resumenItems(v.items)}</td>
      <td class="td-metodo">${iconosMetodo(v)}</td>
      <td class="td-total">${fmt(v.total)}</td>
    </tr>
  `,
    )
    .join("");
}

// ─── RENDER INTERCAMBIOS ────────────────────────────────────────
function renderIntercambios(intercambios) {
  const seccion = document.getElementById("intercambios-section");
  const tbody = document.getElementById("intercambios-list");
  const badge = document.getElementById("badge-intercambios");

  if (!intercambios.length) {
    seccion.style.display = "none";
    return;
  }

  seccion.style.display = "";
  badge.textContent = `${intercambios.length} ${intercambios.length === 1 ? "intercambio" : "intercambios"}`;

  tbody.innerHTML = intercambios
    .map(
      (i) => `
    <tr>
      <td class="td-hora">${formatHora(i.fecha)}</td>
      <td class="td-items">${labelMetodo(i.tipo_entrada)} ${fmt(i.monto_entrada)}</td>
      <td class="td-items">${labelMetodo(i.tipo_salida)} ${fmt(i.monto_salida)}</td>
      <td class="td-items" style="color:var(--muted)">${i.nota || "—"}</td>
    </tr>
  `,
    )
    .join("");
}

// ─── CARGA PRINCIPAL ────────────────────────────────────────────
async function cargarDatos() {
  const btnRefresh = document.getElementById("btn-refresh");
  const iconRefresh = document.getElementById("refresh-icon");
  const estadoCarga = document.getElementById("estado-carga");
  const contenido = document.getElementById("contenido");

  btnRefresh.disabled = true;
  iconRefresh.style.animation = "spin 0.8s linear infinite";

  try {
    const [ventas, intercambios] = await Promise.all([
      fetchVentasDeHoy(),
      fetchIntercambiosDeHoy(),
    ]);

    _ventasSnapshot = ventas;
    _intercambiosSnapshot = intercambios;

    const resumen = calcularResumen(ventas);
    _resumenSnapshot = resumen;

    renderKPIs(resumen);
    renderTabla(ventas);
    renderIntercambios(intercambios);

    estadoCarga.style.display = "none";
    contenido.style.display = "";

    const ahora = new Date().toLocaleTimeString("es-CR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    document.getElementById("ultima-act").textContent =
      `Última actualización: ${ahora}`;
  } catch (err) {
    estadoCarga.innerHTML = `
      <div style="font-size:32px">⚠️</div>
      <p style="color:#f87171">Error al cargar las ventas</p>
      <p style="font-size:12px;color:#6b7280">${err.message}</p>
      <button onclick="cargarDatos()" style="margin-top:12px;padding:8px 20px;
        border-radius:20px;border:1px solid rgba(248,113,113,0.4);
        background:rgba(248,113,113,0.1);color:#f87171;cursor:pointer;font-size:13px;">
        Reintentar
      </button>
    `;
  } finally {
    btnRefresh.disabled = false;
    iconRefresh.style.animation = "";
  }
}

// ─── MODAL DE CIERRE ───────────────────────────────────────────
function confirmarCierre() {
  document.getElementById("modal-cierre").classList.add("open");
  document.getElementById("modal-status").textContent = "";
  document.getElementById("btn-confirmar-cierre").disabled = false;
  document.getElementById("btn-confirmar-cierre").textContent = "Confirmar y Cerrar";
}

function cerrarModal() {
  document.getElementById("modal-cierre").classList.remove("open");
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById("modal-cierre")) cerrarModal();
}

// ─── EJECUTAR CIERRE ───────────────────────────────────────────
async function ejecutarCierre() {
  const btnConfirmar = document.getElementById("btn-confirmar-cierre");
  const statusEl = document.getElementById("modal-status");

  btnConfirmar.disabled = true;
  btnConfirmar.textContent = "Enviando reporte…";
  statusEl.className = "modal-status";
  statusEl.textContent = "⏳ Generando reporte y enviando email…";

  try {
    const htmlReporte = generarHtmlReporte(
      _ventasSnapshot,
      _resumenSnapshot,
      _intercambiosSnapshot,
    );

    await enviarEmailCierre(htmlReporte);

    statusEl.className = "modal-status status-ok";
    statusEl.textContent = "✅ Reporte enviado correctamente";
    btnConfirmar.textContent = "Abriendo Tally…";

    setTimeout(() => {
      window.open(TALLY_URL, "_blank");
      cerrarModal();
      btnConfirmar.disabled = false;
      btnConfirmar.textContent = "Confirmar y Cerrar";
    }, 1200);
  } catch (err) {
    statusEl.className = "modal-status status-error";
    statusEl.textContent = `❌ Error: ${err.message}`;
    btnConfirmar.disabled = false;
    btnConfirmar.textContent = "Reintentar";
    console.error("[Cierre]", err);
  }
}

// ─── GENERAR HTML DEL REPORTE ──────────────────────────────────
function generarHtmlReporte(ventas, resumen, intercambios) {
  const fechaHoy = new Date().toLocaleDateString("es-CR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const horaGenerado = new Date().toLocaleTimeString("es-CR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const r = resumen || {
    total: 0, costo: 0, utilidad: 0, count: 0,
    efectivo: 0, efectivoUtilidad: 0, efectivoCosto: 0,
    tarjeta: 0, tarjetaUtilidad: 0, tarjetaCosto: 0,
    sinpe: 0, sinpeUtilidad: 0, sinpeCosto: 0,
  };

  const filaMetodo = (emoji, nombre, utilidad, costo) => `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;font-weight:600;">${emoji} ${nombre}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;color:#16a34a;font-weight:700;text-align:right;">${fmt(utilidad)}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;color:#dc2626;text-align:right;">${fmt(costo)}</td>
    </tr>`;

  const tablaMetodos = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:8px;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:10px 16px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #e2e8f0;">Método</th>
          <th style="padding:10px 16px;text-align:right;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #e2e8f0;">Utilidad</th>
          <th style="padding:10px 16px;text-align:right;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #e2e8f0;">Costo</th>
        </tr>
      </thead>
      <tbody>
        ${filaMetodo("💵", "Efectivo", r.efectivoUtilidad, r.efectivoCosto)}
        ${filaMetodo("📱", "SINPE", r.sinpeUtilidad, r.sinpeCosto)}
        ${filaMetodo("💳", "Tarjeta", r.tarjetaUtilidad, r.tarjetaCosto)}
      </tbody>
      <tfoot>
        <tr style="background:#f1f5f9;">
          <td style="padding:12px 16px;font-weight:800;color:#0f172a;">TOTAL</td>
          <td style="padding:12px 16px;text-align:right;font-weight:800;color:#16a34a;">${fmt(r.utilidad)}</td>
          <td style="padding:12px 16px;text-align:right;font-weight:800;color:#dc2626;">${fmt(r.costo)}</td>
        </tr>
      </tfoot>
    </table>`;

  const filasVentas = ventas.length
    ? ventas
      .map((v, idx) => `
          <tr style="${idx % 2 === 0 ? "background:#fafafa;" : ""}">
            <td style="padding:9px 12px;font-size:13px;color:#64748b;">${formatHora(v.fecha)}</td>
            <td style="padding:9px 12px;font-size:13px;">${resumenItems(v.items)}</td>
            <td style="padding:9px 12px;font-size:14px;text-align:center;">${iconosMetodo(v)}</td>
            <td style="padding:9px 12px;font-size:13px;font-weight:700;text-align:right;">${fmt(v.total)}</td>
            <td style="padding:9px 12px;font-size:12px;color:#64748b;">Venta</td>
          </tr>`)
      .join("")
    : `<tr><td colspan="5" style="padding:20px;text-align:center;color:#94a3b8;">No hay ventas registradas hoy</td></tr>`;

  const tablaVentas = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0;">Hora</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0;">Servicio</th>
          <th style="padding:10px 12px;text-align:center;font-size:11px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0;">Método</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0;">Monto</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0;">Categoría</th>
        </tr>
      </thead>
      <tbody>${filasVentas}</tbody>
    </table>`;

  const seccionIntercambios = intercambios.length ? `
    <div style="margin-top:32px;">
      <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #e2e8f0;">&#8644; Intercambios de Método de Pago</h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0;">Hora</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0;">Recibí</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0;">Entregué</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0;">Nota</th>
          </tr>
        </thead>
        <tbody>
          ${intercambios.map((i, idx) => `
            <tr style="${idx % 2 === 0 ? "background:#fafafa;" : ""}">
              <td style="padding:9px 12px;font-size:13px;color:#64748b;">${formatHora(i.fecha)}</td>
              <td style="padding:9px 12px;font-size:13px;">${labelMetodo(i.tipo_entrada)} ${fmt(i.monto_entrada)}</td>
              <td style="padding:9px 12px;font-size:13px;">${labelMetodo(i.tipo_salida)} ${fmt(i.monto_salida)}</td>
              <td style="padding:9px 12px;font-size:12px;color:#64748b;">${i.nota || "—"}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>` : "";

  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:600px;">

        <tr>
          <td style="background:linear-gradient(135deg,#1e3a5f,#2d5986);padding:32px 32px 24px;text-align:center;">
            <p style="margin:0;font-size:28px;">🦜</p>
            <h1 style="margin:8px 0 4px;color:white;font-size:22px;font-weight:800;">El Quetzal</h1>
            <p style="margin:0;color:rgba(255,255,255,.8);font-size:14px;">Reporte de Cierre Diario</p>
            <p style="margin:6px 0 0;color:rgba(255,255,255,.95);font-size:16px;font-weight:600;">${fechaHoy}</p>
            <p style="margin:4px 0 0;color:rgba(255,255,255,.6);font-size:12px;">Generado a las ${horaGenerado}</p>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 32px 8px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="33%" style="text-align:center;padding:16px;background:#f8fafc;border-radius:8px;">
                  <p style="margin:0;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">Ingreso Bruto</p>
                  <p style="margin:6px 0 0;font-size:20px;font-weight:800;color:#0f172a;">${fmt(r.total)}</p>
                </td>
                <td width="4%"></td>
                <td width="33%" style="text-align:center;padding:16px;background:#fef2f2;border-radius:8px;">
                  <p style="margin:0;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">Costo</p>
                  <p style="margin:6px 0 0;font-size:20px;font-weight:800;color:#dc2626;">${fmt(r.costo)}</p>
                </td>
                <td width="4%"></td>
                <td width="33%" style="text-align:center;padding:16px;background:#f0fdf4;border-radius:8px;">
                  <p style="margin:0;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">Utilidad</p>
                  <p style="margin:6px 0 0;font-size:20px;font-weight:800;color:#16a34a;">${fmt(r.utilidad)}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 32px 8px;">
            <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #e2e8f0;">💳 Resumen por Método de Pago</h3>
            ${tablaMetodos}
          </td>
        </tr>

        <tr>
          <td style="padding:16px 32px 8px;">
            <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #e2e8f0;">🧾 Detalle de Ventas (${r.count} transacciones)</h3>
            ${tablaVentas}
          </td>
        </tr>

        <tr>
          <td style="padding:8px 32px 24px;">
            ${seccionIntercambios}
          </td>
        </tr>

        <tr>
          <td style="background:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">El Quetzal · Sus Amigos Detailer's Center</p>
            <p style="margin:4px 0 0;font-size:11px;color:#cbd5e1;">Este reporte fue generado automáticamente al ejecutar el cierre diario.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── ENVIAR EMAIL VIA N8N WEBHOOK ──────────────────────────────
async function enviarEmailCierre(htmlReporte) {
  const fechaHoy = new Date().toLocaleDateString("es-CR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const payload = JSON.stringify({
    fecha: fechaHoy,
    reporte_html: htmlReporte,
    ventas_count: _ventasSnapshot.length,
    total_dia: _resumenSnapshot?.total ?? 0,
    utilidad_dia: _resumenSnapshot?.utilidad ?? 0,
  });

  // mode: 'no-cors' + text/plain = simple request sin preflight.
  // Funciona desde file:// local sin necesitar headers CORS en n8n.
  // En n8n: usar JSON.parse($json.body).fecha y JSON.parse($json.body).reporte_html
  await fetch(N8N_WEBHOOK_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain" },
    body: payload,
  });

  // Con no-cors la respuesta es "opaque" (no podemos leerla),
  // pero la petición SÍ llega a n8n si el workflow está activo.
}

// ─── INIT ────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const hoy = new Date().toLocaleDateString("es-CR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const titulo = hoy.charAt(0).toUpperCase() + hoy.slice(1);
  document.getElementById("fecha-titulo").textContent = titulo;

  cargarDatos();

  // Auto-refresh cada 60 segundos
  setInterval(cargarDatos, 60_000);
});
