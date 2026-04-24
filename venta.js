/**
 * venta.js — Punto de Venta El Quetzal v1.0
 * Supabase: productos + ventas
 */

// ─── SUPABASE ──────────────────────────────────────────────────
const SUPABASE_URL = "https://dfcmvelgksgjkryhdooe.supabase.co";
const SUPABASE_KEY = "sb_publishable_djehLvcT_gtZBlKMqzguBA_tu9F6_aA";
const HEADERS = {
  "Content-Type": "application/json",
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
};

// ─── ESTADO ────────────────────────────────────────────────────
let productos = [];
let carrito = []; // [{ producto, cantidad, subtotal }]
let metodosActivos = new Set(["efectivo"]); // multi-select

// ─── API ───────────────────────────────────────────────────────
async function apiGetProductos() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/productos?select=*&order=nombre.asc`,
    { headers: HEADERS },
  );
  if (!res.ok) throw new Error("Error al cargar productos");
  return res.json();
}

async function apiUpdateStock(id, nuevaCantidad) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/productos?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...HEADERS, Prefer: "return=minimal" },
    body: JSON.stringify({ cantidad: nuevaCantidad }),
  });
  if (!res.ok) throw new Error("Error al actualizar stock");
}

async function apiGuardarVenta(venta) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/ventas`, {
    method: "POST",
    headers: { ...HEADERS, Prefer: "return=representation" },
    body: JSON.stringify(venta),
  });
  if (!res.ok) throw new Error("Error al guardar venta");
  return res.json();
}

// Registra movimientos de inventario (ENTRADA o SALIDA)
async function apiGuardarMovimiento(movimiento) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/movimientos`, {
    method: "POST",
    headers: { ...HEADERS, Prefer: "return=minimal" },
    body: JSON.stringify(movimiento),
  });
  if (!res.ok) throw new Error("Error al guardar movimiento");
}

// ─── UTILIDADES ────────────────────────────────────────────────
const fmt = (n) => "₡" + Number(n).toLocaleString("es-CR");
const generateId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2);

function actualizarReloj() {
  const now = new Date();
  document.getElementById("fecha-hora").textContent =
    now.toLocaleDateString("es-CR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    }) +
    " · " +
    now.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" });
}

// ─── BÚSQUEDA ──────────────────────────────────────────────────
function buscarProductos() {
  const q = document
    .getElementById("search-producto")
    .value.trim()
    .toLowerCase();
  const container = document.getElementById("search-results");

  if (!q) {
    container.innerHTML = "";
    return;
  }

  const resultados = productos
    .filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) || (p.barcode || "").includes(q),
    )
    .slice(0, 8);

  if (!resultados.length) {
    container.innerHTML = `<div style="padding:10px;text-align:center;color:#8a97b5;font-size:13px;">Sin resultados</div>`;
    return;
  }

  container.innerHTML = resultados
    .map((p) => {
      const agotado = p.cantidad <= 0;
      const stockCls = agotado
        ? "stock-out"
        : p.cantidad <= p.minimo
          ? "stock-warn"
          : "stock-ok";
      const stockLabel = agotado ? "Agotado" : `${p.cantidad} uds`;
      return `
      <div class="search-item ${agotado ? "agotado" : ""}" onclick="${agotado ? "" : `agregarAlCarrito('${p.id}')`}">
        <div class="si-info">
          <div class="si-nombre">${p.nombre}</div>
          <div class="si-detalle">${p.categoria || ""} · ${p.unidad}</div>
        </div>
        <span class="si-precio">${fmt(p.pventa)}</span>
        <span class="si-stock-badge ${stockCls}">${stockLabel}</span>
      </div>`;
    })
    .join("");
}

// ─── CARRITO ───────────────────────────────────────────────────
function agregarAlCarrito(id) {
  const producto = productos.find((p) => p.id === id);
  if (!producto || producto.cantidad <= 0) return;

  // IMPORTANTE: No buscamos si ya existe.
  // Creamos una instancia única para que se duplique la fila.
  carrito.push({
    instanciaId: generateId(), // ID único para la fila
    producto,
    cantidad: 1,
    subtotal: producto.pventa,
  });

  // Limpiar buscador y resultados
  document.getElementById("search-producto").value = "";
  document.getElementById("search-results").innerHTML = "";

  renderCarrito();
  showToast(`✓ ${producto.nombre}`);
}

function limpiarCarrito() {
  carrito = [];
  renderCarrito();
}

function renderCarrito() {
  const container = document.getElementById("carrito-items");
  const empty = document.getElementById("carrito-empty");

  // Eliminar solo las filas del carrito, sin tocar el placeholder vacío
  container.querySelectorAll(".carrito-row").forEach((el) => el.remove());

  if (!carrito.length) {
    empty.style.display = "flex";
    actualizarResumen();
    return;
  }

  empty.style.display = "none";

  // Generamos el HTML para cada fila individual (1 escaneo = 1 línea)
  const rowsHtml = carrito
    .map(
      (item) => `
    <div class="carrito-row">
      <span class="cr-nombre">${item.producto.nombre}</span>
      <span class="cr-qty">1 ud</span>
      <span class="cr-precio">${fmt(item.producto.pventa)}</span>
      <button class="cr-del" onclick="quitarDelCarrito('${item.instanciaId}')">✕</button>
    </div>
  `,
    )
    .join("");

  container.insertAdjacentHTML("beforeend", rowsHtml);

  actualizarResumen();
}

function quitarDelCarrito(instanciaId) {
  // Filtramos por el ID único de la fila
  carrito = carrito.filter((i) => i.instanciaId !== instanciaId);
  renderCarrito();
}

function actualizarResumen() {
  const total = carrito.reduce((s, i) => s + i.subtotal, 0);
  const items = carrito.reduce((s, i) => s + i.cantidad, 0);

  document.getElementById("r-subtotal").textContent = fmt(total);
  document.getElementById("r-total").textContent = fmt(total);
  document.getElementById("r-items").textContent = items;

  // Habilitar cobrar si hay items
  const btn = document.getElementById("btn-cobrar");
  btn.disabled = carrito.length === 0;

  calcularDiferencia();
}

// ─── MÉTODO DE PAGO (multi-select) ─────────────────────────────
function toggleMetodo(metodo) {
  if (metodosActivos.has(metodo)) {
    if (metodosActivos.size === 1) return; // Al menos uno activo siempre
    metodosActivos.delete(metodo);
  } else {
    metodosActivos.add(metodo);
  }

  ["efectivo", "tarjeta", "sinpe"].forEach((m) => {
    const isActive = metodosActivos.has(m);
    document.querySelector(`[data-metodo="${m}"]`).classList.toggle("active", isActive);
    document.getElementById(`panel-${m}`).style.display = isActive ? "flex" : "none";
  });

  calcularDiferencia();
}

function calcularDiferencia() {
  const total = carrito.reduce((s, i) => s + i.subtotal, 0);
  let sumado = 0;
  if (metodosActivos.has("efectivo"))
    sumado += parseFloat(document.getElementById("monto-efectivo").value) || 0;
  if (metodosActivos.has("tarjeta"))
    sumado += parseFloat(document.getElementById("monto-tarjeta").value) || 0;
  if (metodosActivos.has("sinpe"))
    sumado += parseFloat(document.getElementById("monto-sinpe").value) || 0;

  const diff = sumado - total;
  const display = document.getElementById("diferencia-display");
  const labelEl = document.getElementById("diferencia-label");
  const montoEl = document.getElementById("diferencia-monto");

  if (sumado > 0) {
    display.style.display = "flex";
    if (diff < 0) {
      display.className = "vuelto-display faltante";
      labelEl.textContent = "Faltante";
      montoEl.textContent = fmt(Math.abs(diff));
    } else {
      display.className = "vuelto-display";
      labelEl.textContent = diff === 0 ? "✓ Exacto" : "Vuelto";
      montoEl.textContent = fmt(diff);
    }
  } else {
    display.style.display = "none";
  }
}

// ─── PROCESAR VENTA ────────────────────────────────────────────
async function procesarVenta() {
  if (!carrito.length) return;

  const total = carrito.reduce((s, i) => s + i.subtotal, 0);
  let montoEfectivo = 0, montoTarjeta = 0, montoSinpe = 0, vuelto = 0;

  // Recoger montos de los métodos activos
  if (metodosActivos.has("efectivo"))
    montoEfectivo = parseFloat(document.getElementById("monto-efectivo").value) || 0;
  if (metodosActivos.has("tarjeta"))
    montoTarjeta = parseFloat(document.getElementById("monto-tarjeta").value) || 0;
  if (metodosActivos.has("sinpe"))
    montoSinpe = parseFloat(document.getElementById("monto-sinpe").value) || 0;

  const sumado = montoEfectivo + montoTarjeta + montoSinpe;
  if (sumado < total) return showToast("⚠️ El monto ingresado es insuficiente");
  vuelto = sumado - total;

  const btn = document.getElementById("btn-cobrar");
  btn.disabled = true;
  btn.textContent = "Procesando…";

  try {
    // 1. Descontar stock en Supabase (agrupa por producto para no duplicar descuentos)
    const stockPorProducto = {};
    for (const item of carrito) {
      if (!stockPorProducto[item.producto.id]) {
        stockPorProducto[item.producto.id] = {
          producto: item.producto,
          totalCantidad: 0,
        };
      }
      stockPorProducto[item.producto.id].totalCantidad += item.cantidad;
    }
    for (const { producto, totalCantidad } of Object.values(stockPorProducto)) {
      const nuevaCantidad = producto.cantidad - totalCantidad;
      await apiUpdateStock(producto.id, nuevaCantidad);
      // Actualizar local
      const prod = productos.find((p) => p.id === producto.id);
      if (prod) prod.cantidad = nuevaCantidad;
    }

    // 2. Guardar venta en Supabase
    const venta = {
      id: generateId(),
      items: carrito.map((i) => ({
        id: i.producto.id,
        nombre: i.producto.nombre,
        cantidad: i.cantidad,
        pventa: i.producto.pventa,
        pcosto: i.producto.pcosto || 0,
        subtotal: i.subtotal,
      })),
      subtotal: total,
      total,
      metodo_pago: [...metodosActivos].join("+"),
      monto_efectivo: montoEfectivo,
      monto_tarjeta: montoTarjeta,
      monto_sinpe: montoSinpe,
      vuelto,
    };

    await apiGuardarVenta(venta);

    // 3. Registrar movimientos de inventario (SALIDA por VENTA)
    // No bloquea la venta si la tabla aún no existe en Supabase
    try {
      await Promise.all(
        Object.values(stockPorProducto).map(({ producto, totalCantidad }) =>
          apiGuardarMovimiento({
            id: generateId(),
            producto_id: producto.id,
            producto_nombre: producto.nombre,
            cantidad: totalCantidad,
            tipo: "SALIDA",
            motivo: "VENTA",
            venta_id: venta.id,
          }),
        ),
      );
    } catch (movErr) {
      console.warn("[movimientos] No registrado:", movErr.message);
    }

    // 4. Mostrar recibo
    mostrarRecibo(venta);
  } catch (err) {
    console.error(err);
    showToast("❌ Error al procesar la venta. Intentá de nuevo.");
    btn.disabled = false;
    btn.textContent = "Cobrar";
  }
}

// ─── RECIBO ────────────────────────────────────────────────────
function mostrarRecibo(venta) {
  const fecha = new Date().toLocaleString("es-CR", {
    dateStyle: "full",
    timeStyle: "short",
  });

  document.getElementById("recibo-fecha").textContent = fecha;

  let reciboPago = "";
  if (venta.monto_efectivo > 0)
    reciboPago += `<div class="rt-linea"><span>💵 Efectivo</span><span class="mono">${fmt(venta.monto_efectivo)}</span></div>`;
  if (venta.monto_tarjeta > 0)
    reciboPago += `<div class="rt-linea"><span>💳 Tarjeta</span><span class="mono">${fmt(venta.monto_tarjeta)}</span></div>`;
  if (venta.monto_sinpe > 0)
    reciboPago += `<div class="rt-linea"><span>📱 Sinpe</span><span class="mono">${fmt(venta.monto_sinpe)}</span></div>`;
  if (venta.vuelto > 0)
    reciboPago += `<div class="rt-linea vuelto"><span>Vuelto</span><span class="mono">${fmt(venta.vuelto)}</span></div>`;

  document.getElementById("recibo-body").innerHTML = `
    <div class="recibo-items">
      ${venta.items
      .map(
        (i) => `
        <div class="recibo-item">
          <span class="ri-nombre">${i.nombre}</span>
          <span class="ri-qty">×${i.cantidad}</span>
          <span class="ri-precio">${fmt(i.subtotal)}</span>
        </div>
      `,
      )
      .join("")}
    </div>
    <div class="recibo-totales">
      <div class="rt-linea total"><span>TOTAL</span><span class="mono">${fmt(venta.total)}</span></div>
      ${reciboPago}
    </div>
  `;

  document.getElementById("overlay-recibo").classList.add("open");
}

function cerrarRecibo() {
  document.getElementById("overlay-recibo").classList.remove("open");
}

function nuevaVenta() {
  cerrarRecibo();
  carrito = [];
  renderCarrito();
  document.getElementById("monto-efectivo").value = "";
  document.getElementById("monto-tarjeta").value = "";
  document.getElementById("monto-sinpe").value = "";
  document.getElementById("mixto-efectivo").value = "";
  document.getElementById("mixto-tarjeta").value = "";
  document.getElementById("mixto-sinpe").value = "";
  document.getElementById("vuelto-display").style.display = "none";
  document.getElementById("mixto-diff").style.display = "none";
  document.getElementById("btn-cobrar").textContent = "Cobrar";
  seleccionarMetodo("efectivo");
}

// ─── TOAST ─────────────────────────────────────────────────────
function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove("show"), 2800);
}

// ─── INICIO ────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  actualizarReloj();
  setInterval(actualizarReloj, 30000);

  // Escaneo con Enter en el campo de búsqueda
  document
    .getElementById("search-producto")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const results = document.querySelectorAll(".search-item:not(.agotado)");
        if (results.length === 1) results[0].click();
      }
    });

  try {
    productos = await apiGetProductos();
  } catch (err) {
    showToast("❌ Error al cargar productos");
  }
});
