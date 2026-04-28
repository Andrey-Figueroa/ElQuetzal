/**
 * main.js - Gestión de Inventario El Quetzal v1.3
 * Base de datos: Supabase (PostgreSQL)
 */

// ─── 1. CONFIGURACIÓN SUPABASE ─────────────────────────────────
const SUPABASE_URL = "https://dfcmvelgksgjkryhdooe.supabase.co";
const SUPABASE_KEY = "sb_publishable_djehLvcT_gtZBlKMqzguBA_tu9F6_aA";
const HEADERS = {
  "Content-Type": "application/json",
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
};

// ─── 2. ESTADO GLOBAL ──────────────────────────────────────────
const CATEGORIAS_SUGERIDAS = [
  "Abarrotes",
  "Snacks y Golosinas",
  "Bebidas",
  "Lácteos y Embutidos",
  "Panadería",
  "Limpieza",
  "Cuidado Personal",
  "Frutas y Verduras",
  "Licores",
  "Cigarrillos",
  "Huevo y Granja",
];

let productos = [];
let editId = null;

// ─── 3. API SUPABASE ───────────────────────────────────────────
async function dbGetAll() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/productos?select=*&order=nombre.asc`,
    { headers: HEADERS },
  );
  if (!res.ok) throw new Error("Error al obtener productos");
  return await res.json();
}

async function dbInsert(producto) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/productos`, {
    method: "POST",
    headers: { ...HEADERS, Prefer: "return=representation" },
    body: JSON.stringify(producto),
  });
  if (!res.ok) throw new Error("Error al insertar producto");
  return await res.json();
}

async function dbUpdate(id, producto) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/productos?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...HEADERS, Prefer: "return=representation" },
    body: JSON.stringify(producto),
  });
  if (!res.ok) throw new Error("Error al actualizar producto");
  return await res.json();
}

async function dbDelete(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/productos?id=eq.${id}`, {
    method: "DELETE",
    headers: HEADERS,
  });
  if (!res.ok) throw new Error("Error al eliminar producto");
}

// ─── 4. UTILIDADES ─────────────────────────────────────────────
const generateUUID = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2);
const formatCurrency = (amount) => "₡" + Number(amount).toLocaleString("es-CR");

function getStockStatus(producto) {
  if (producto.cantidad <= 0)
    return { label: "Sin Existencias", cls: "badge-danger" };
  if (producto.cantidad <= producto.minimo)
    return { label: "Punto de Pedido", cls: "badge-warn" };
  return { label: "Nivel Óptimo", cls: "badge-ok" };
}

function showLoading(show) {
  if (show) {
    document.getElementById("tbody").innerHTML =
      `<tr><td colspan="9" style="text-align:center;padding:30px;color:#8a97b5;">⏳ Cargando...</td></tr>`;
  }
}

// ─── 5. RENDERIZADO ────────────────────────────────────────────
function updateDashboardStats() {
  const totalUnidades = productos.reduce(
    (sum, p) => sum + (p.cantidad || 0),
    0,
  );
  const totalValor = productos.reduce(
    (sum, p) => sum + (p.pcosto || 0) * (p.cantidad || 0),
    0,
  );
  const optimo = productos.filter((p) => p.cantidad > p.minimo).length;
  const pedido = productos.filter(
    (p) => p.cantidad > 0 && p.cantidad <= p.minimo,
  ).length;
  const agotado = productos.filter((p) => p.cantidad <= 0).length;

  document.getElementById("stat-total").textContent =
    totalUnidades.toLocaleString("es-CR");
  document.getElementById("stat-valor").textContent =
    formatCurrency(totalValor);
  document.getElementById("stat-ok").textContent = optimo;
  document.getElementById("stat-alertas").textContent = pedido;
  document.getElementById("stat-agotados").textContent = agotado;
}

function renderTable() {
  const searchTerm = document.getElementById("search").value.toLowerCase();
  const categoryFilter = document.getElementById("filter-cat").value;
  const stockFilter = document.getElementById("filter-stock").value;

  const filteredList = productos.filter((p) => {
    const matchesSearch =
      p.nombre.toLowerCase().includes(searchTerm) ||
      (p.barcode || "").includes(searchTerm);
    const matchesCategory = !categoryFilter || p.categoria === categoryFilter;
    const status = getStockStatus(p).label;
    const matchesStock =
      !stockFilter ||
      (stockFilter === "bajo" && status === "Punto de Pedido") ||
      (stockFilter === "agotado" && status === "Sin Existencias");
    return matchesSearch && matchesCategory && matchesStock;
  });

  const tbody = document.getElementById("tbody");
  tbody.innerHTML = "";
  document.getElementById("empty").style.display = filteredList.length
    ? "none"
    : "block";

  filteredList.forEach((p) => {
    const status = getStockStatus(p);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="badge-bc">${p.barcode || "—"}</span></td>
      <td><strong>${p.nombre}</strong></td>
      <td><span class="badge-cat">${p.categoria || "—"}</span></td>
      <td class="mono">${formatCurrency(p.pventa)}</td>
      <td class="mono">${formatCurrency(p.pcosto)}</td>
      <td>${p.unidad}</td>
      <td class="mono"><strong>${p.cantidad}</strong><span style="color:#8a97b5;font-size:12px"> / mín ${p.minimo}</span></td>
      <td><span class="badge-status ${status.cls}">${status.label}</span></td>
      <td class="actions">
        <button class="btn-action btn-edit"   onclick="openModal('${p.id}')">Editar</button>
        <button class="btn-action btn-delete" onclick="pedirPassword(() => eliminarProducto('${p.id}'))">Borrar</button>
      </td>`;
    tbody.appendChild(tr);
  });

  updateDashboardStats();
  refreshCategorySelects();
}

function refreshCategorySelects() {
  const productosCats = [
    ...new Set(productos.map((p) => p.categoria).filter(Boolean)),
  ];
  const todasLasCats = [
    ...new Set([...CATEGORIAS_SUGERIDAS, ...productosCats]),
  ].sort();

  const filterSelect = document.getElementById("filter-cat");
  const catSelect = document.getElementById("f-cat");
  if (!filterSelect || !catSelect) return;

  const currentFilter = filterSelect.value;
  const currentCat = catSelect.value;

  filterSelect.innerHTML =
    '<option value="">Todas las categorías</option>' +
    todasLasCats
      .map(
        (c) =>
          `<option value="${c}" ${c === currentFilter ? "selected" : ""}>${c}</option>`,
      )
      .join("");

  catSelect.innerHTML =
    '<option value="" disabled>— Seleccioná una categoría —</option>' +
    todasLasCats
      .map(
        (c) =>
          `<option value="${c}" ${c === currentCat ? "selected" : ""}>${c}</option>`,
      )
      .join("");

  if (!currentCat) catSelect.value = "";
}

// ─── 6. CARGA INICIAL ──────────────────────────────────────────
async function cargarProductos() {
  showLoading(true);
  try {
    productos = await dbGetAll();
    renderTable();
  } catch (err) {
    console.error(err);
    showToast("❌ Error al conectar con la base de datos");
    document.getElementById("tbody").innerHTML =
      `<tr><td colspan="9" style="text-align:center;padding:30px;color:#991b1b;">
        ❌ No se pudo conectar con Supabase. Revisá tu conexión a internet.
      </td></tr>`;
  }
}

// ─── 7. GESTIÓN DE PRODUCTOS (MODAL) ───────────────────────────
function openModal(id = null, fromScan = false) {
  editId = id;
  const p = id ? productos.find((x) => x.id === id) : {};

  document.getElementById("modal-title").textContent = id
    ? "Editar producto"
    : "Agregar producto";
  document.getElementById("nuevo-badge").style.display = fromScan
    ? "inline-flex"
    : "none";

  document.getElementById("f-barcode").value = p.barcode || "";
  document.getElementById("f-nombre").value = p.nombre || "";
  document.getElementById("f-unidad").value = p.unidad || "Unidad";
  document.getElementById("f-pventa").value = p.pventa !== undefined ? p.pventa : "";
  document.getElementById("f-pcosto").value = p.pcosto !== undefined ? p.pcosto : "";
  document.getElementById("f-cantidad").value = p.cantidad !== undefined ? p.cantidad : "";
  document.getElementById("f-minimo").value = p.minimo !== undefined ? p.minimo : 5;

  refreshCategorySelects();
  if (p.categoria) document.getElementById("f-cat").value = p.categoria;

  document.getElementById("overlay").classList.add("open");
  setTimeout(
    () =>
      document.getElementById(p && p.barcode ? "f-nombre" : "f-barcode").focus(),
    100,
  );
}

function closeModal() {
  document.getElementById("overlay").classList.remove("open");
  editId = null;
}

async function guardar() {
  const nombre = document.getElementById("f-nombre").value.trim();
  if (!nombre) return showToast("⚠️ El nombre es obligatorio");

  const categoria = document.getElementById("f-cat").value;
  if (!categoria) return showToast("⚠️ Seleccioná una categoría");

  const pData = {
    id: editId || generateUUID(),
    nombre,
    barcode: document.getElementById("f-barcode").value.trim(),
    categoria,
    unidad: document.getElementById("f-unidad").value,
    pventa: parseFloat(document.getElementById("f-pventa").value) || 0,
    pcosto: parseFloat(document.getElementById("f-pcosto").value) || 0,
    cantidad: parseFloat(document.getElementById("f-cantidad").value) || 0,
    minimo: parseFloat(document.getElementById("f-minimo").value) || 0,
  };

  try {
    if (editId) {
      await dbUpdate(editId, pData);
      productos[productos.findIndex((p) => p.id === editId)] = pData;
      showToast("✓ Producto actualizado");
    } else {
      await dbInsert(pData);
      productos.push(pData);
      showToast("✓ Producto agregado");
    }
    closeModal();
    renderTable();
  } catch (err) {
    console.error(err);
    showToast("❌ Error al guardar. Intentá de nuevo.");
  }
}

function pedirPassword(callback) {
  const pass = prompt("🔒 Ingresá la contraseña para continuar:");
  if (pass === null) return;
  if (pass === "Phaneus2026") {
    callback();
  } else {
    showToast("❌ Contraseña incorrecta");
  }
}

async function eliminarProducto(id) {
  try {
    await dbDelete(id);
    productos = productos.filter((p) => p.id !== id);
    renderTable();
    showToast("Producto eliminado");
  } catch (err) {
    console.error(err);
    showToast("❌ Error al eliminar. Intentá de nuevo.");
  }
}

// ─── 8. MODO ESCANEO ───────────────────────────────────────────
function toggleScan() {
  const panel = document.getElementById("scan-panel");
  const isOpen = panel.classList.toggle("open");
  if (isOpen)
    setTimeout(() => document.getElementById("scan-barcode").focus(), 100);
}

document.getElementById("scan-barcode").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const code = e.target.value.trim();
    if (code) procesarEscaneo(code);
    e.target.value = "";
  }
});

async function procesarEscaneo(code) {
  const step = parseInt(document.getElementById("scan-step").value) || 1;
  const producto = productos.find((p) => p.barcode === code);

  if (producto) {
    const nuevaCantidad = producto.cantidad + step;
    try {
      await dbUpdate(producto.id, { ...producto, cantidad: nuevaCantidad });
      producto.cantidad = nuevaCantidad;
      renderTable();
      showToast(`+${step} unidades: ${producto.nombre}`);
    } catch (err) {
      showToast("❌ Error al actualizar cantidad");
    }
  } else {
    openModal(null, true);
    document.getElementById("f-barcode").value = code;
    document.getElementById("f-cantidad").value = step;
    showToast("★ Producto nuevo detectado");
  }
}

// ─── 9. INTERFAZ Y EVENTOS ─────────────────────────────────────
function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), 3000);
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});
function closeIfBg(e) {
  if (e.target.id === "overlay") closeModal();
}

// ─── 10. INICIO ────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  cargarProductos();
});
