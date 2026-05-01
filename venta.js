/**
 * venta.js — Punto de Venta El Quetzal v1.1
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
let carrito = []; // [{ instanciaId, producto, cantidad, subtotal }]
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

function enfocarBuscador() {
  document.getElementById("search-producto").focus();
}

// ─── ESCANEO / INGRESO ─────────────────────────────────────────
// El campo de búsqueda es SOLO para escanear códigos de barras o ingresar montos.
// No se muestra dropdown. Solo procesa al presionar Enter.
//
// Reglas al presionar Enter:
//   1. Si el valor coincide con un código de barras → agrega el producto
//   2. Si el valor es un número puro (sin barcode match) → "Producto no etiquetado" por ese monto
//   3. Si no coincide con nada → "No encontrado", limpia y sigue listo
function procesarEscaneo() {
  const input = document.getElementById("search-producto");
  const val = input.value.trim();

  // Siempre limpiar el campo al procesar
  input.value = "";

  if (!val) {
    input.focus();
    return;
  }

  // 1. Buscar por código de barras exacto
  const porBarcode = productos.find(
    (p) => (p.barcode || "").trim() === val,
  );
  if (porBarcode) {
    if (porBarcode.cantidad <= 0) {
      showToast("⚠️ Producto agotado: " + porBarcode.nombre);
    } else {
      agregarAlCarrito(porBarcode.id);
    }
    input.focus();
    return;
  }

  // 2. Si es un número puro → monto de producto no etiquetado
  const esMonto = /^\d+(\.\d{1,2})?$/.test(val);
  if (esMonto) {
    const monto = parseFloat(val);
    if (monto > 0) {
      agregarProductoNoEtiquetado(monto);
    } else {
      showToast("⚠️ El monto debe ser mayor a cero");
    }
    input.focus();
    return;
  }

  // 3. No encontrado (texto que no es barcode ni número)
  showToast("❌ Producto no encontrado");
  input.focus();
}

// ─── PRODUCTO NO ETIQUETADO ────────────────────────────────────
function agregarProductoNoEtiquetado(monto) {
  carrito.push({
    instanciaId: generateId(),
    producto: {
      id: "no-etiquetado",
      nombre: "Producto no etiquetado",
      pventa: monto,
      pcosto: monto * 0.75,
      cantidad: Infinity, // no afecta inventario
      noEtiquetado: true,
    },
    cantidad: 1,
    subtotal: monto,
  });
  renderCarrito();
  showToast(`✓ Producto no etiquetado — ${fmt(monto)}`);
}

// ─── CARRITO ───────────────────────────────────────────────────
function agregarAlCarrito(id) {
  const producto = productos.find((p) => p.id === id);
  if (!producto || producto.cantidad <= 0) return;

  carrito.push({
    instanciaId: generateId(),
    producto,
    cantidad: 1,
    subtotal: producto.pventa,
  });

  renderCarrito();
  showToast(`✓ ${producto.nombre}`);
}

function limpiarCarrito() {
  carrito = [];
  renderCarrito();
  enfocarBuscador();
}

function renderCarrito() {
  const container = document.getElementById("carrito-items");
  const empty = document.getElementById("carrito-empty");

  container.querySelectorAll(".carrito-row").forEach((el) => el.remove());

  if (!carrito.length) {
    empty.style.display = "flex";
    actualizarResumen();
    return;
  }

  empty.style.display = "none";

  const rowsHtml = carrito
    .map(
      (item) => `
    <div class="carrito-row">
      <span class="cr-nombre">${item.producto.nombre}${item.producto.noEtiquetado ? " 🏷️" : ""}</span>
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
  carrito = carrito.filter((i) => i.instanciaId !== instanciaId);
  renderCarrito();
  enfocarBuscador();
}

function actualizarResumen() {
  const total = carrito.reduce((s, i) => s + i.subtotal, 0);
  const items = carrito.reduce((s, i) => s + i.cantidad, 0);

  document.getElementById("r-subtotal").textContent = fmt(total);
  document.getElementById("r-total").textContent = fmt(total);
  document.getElementById("r-items").textContent = items;

  const btn = document.getElementById("btn-cobrar");
  btn.disabled = carrito.length === 0;

  calcularDiferencia();
}

// ─── MÉTODO DE PAGO ────────────────────────────────────────────
// Si hay 1 solo método activo: no se muestran los inputs de monto,
//   se cobra automáticamente por el total al presionar Cobrar.
// Si hay 2 o más métodos activos: se muestran los inputs para distribuir.

function toggleMetodo(metodo) {
  if (metodosActivos.has(metodo)) {
    if (metodosActivos.size === 1) return; // siempre al menos uno activo
    metodosActivos.delete(metodo);
  } else {
    metodosActivos.add(metodo);
  }
  actualizarPanelesPago();
  calcularDiferencia();
}

function actualizarPanelesPago() {
  const multiple = metodosActivos.size > 1;
  ["efectivo", "tarjeta", "sinpe"].forEach((m) => {
    const isActive = metodosActivos.has(m);
    document
      .querySelector(`[data-metodo="${m}"]`)
      .classList.toggle("active", isActive);
    // Solo mostrar inputs cuando hay múltiples métodos
    const panel = document.getElementById(`panel-${m}`);
    panel.style.display = isActive && multiple ? "flex" : "none";
  });
}

function calcularDiferencia() {
  const display = document.getElementById("diferencia-display");

  // Si es un solo método: no hace falta ingresar monto → ocultar diferencia
  if (metodosActivos.size === 1) {
    display.style.display = "none";
    return;
  }

  const total = carrito.reduce((s, i) => s + i.subtotal, 0);
  let sumado = 0;
  if (metodosActivos.has("efectivo"))
    sumado += parseFloat(document.getElementById("monto-efectivo").value) || 0;
  if (metodosActivos.has("tarjeta"))
    sumado += parseFloat(document.getElementById("monto-tarjeta").value) || 0;
  if (metodosActivos.has("sinpe"))
    sumado += parseFloat(document.getElementById("monto-sinpe").value) || 0;

  const diff = sumado - total;
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

  if (metodosActivos.size === 1) {
    // Un solo método → se cobra exactamente el total, sin pedir monto
    const [unico] = metodosActivos;
    if (unico === "efectivo") montoEfectivo = total;
    else if (unico === "tarjeta") montoTarjeta = total;
    else if (unico === "sinpe") montoSinpe = total;
    vuelto = 0;
  } else {
    // Múltiples métodos → verificar que el monto ingresado sea suficiente
    if (metodosActivos.has("efectivo"))
      montoEfectivo = parseFloat(document.getElementById("monto-efectivo").value) || 0;
    if (metodosActivos.has("tarjeta"))
      montoTarjeta = parseFloat(document.getElementById("monto-tarjeta").value) || 0;
    if (metodosActivos.has("sinpe"))
      montoSinpe = parseFloat(document.getElementById("monto-sinpe").value) || 0;

    const sumado = montoEfectivo + montoTarjeta + montoSinpe;
    if (sumado < total) {
      return showToast("⚠️ El monto ingresado es insuficiente");
    }
    vuelto = sumado - total;
  }

  const btn = document.getElementById("btn-cobrar");
  btn.disabled = true;
  btn.textContent = "Procesando…";

  try {
    // 1. Descontar stock (saltear productos no etiquetados)
    const stockPorProducto = {};
    for (const item of carrito) {
      if (item.producto.noEtiquetado) continue; // sin inventario
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
        no_etiquetado: i.producto.noEtiquetado || false,
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

    // 3. Registrar movimientos (solo productos del inventario)
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
          <span class="ri-nombre">${i.nombre}${i.no_etiquetado ? " 🏷️" : ""}</span>
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
  document.getElementById("diferencia-display").style.display = "none";

  const btnCobrar = document.getElementById("btn-cobrar");
  btnCobrar.textContent = "Cobrar";
  btnCobrar.disabled = true;

  metodosActivos = new Set(["efectivo"]);
  actualizarPanelesPago();

  enfocarBuscador();
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

  // Inicializar paneles de pago (1 método = sin inputs)
  actualizarPanelesPago();

  // El campo solo procesa al presionar Enter
  const searchInput = document.getElementById("search-producto");
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      procesarEscaneo();
    }
  });

  // Devolver foco al campo al hacer clic en cualquier área que no sea input/button
  document.addEventListener("click", (e) => {
    const esInteractivo =
      e.target.tagName === "INPUT" ||
      e.target.tagName === "BUTTON" ||
      e.target.closest("button") ||
      e.target.closest(".overlay");
    if (!esInteractivo) {
      enfocarBuscador();
    }
  });

  try {
    productos = await apiGetProductos();
    enfocarBuscador();
  } catch (err) {
    showToast("❌ Error al cargar productos");
  }
});
