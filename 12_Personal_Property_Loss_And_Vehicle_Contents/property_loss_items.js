/*
 * property_loss_items.js — personal property that was in the 2025 Atlas (TX WHB6147) at the time of the
 * August 28, 2026 collision and was lost, damaged or destroyed.
 *
 * TO ADD AN ITEM: copy one of the blocks below (from "{" to "},") and fill it in. Only "item" is required.
 * Values are in US dollars. Dates are written YYYY-MM-DD. Put receipts and photos in Receipts_And_Photos/
 * and list their file names under "proof". Save the file; the binder page and the portal card update on
 * reload, and the dossier table updates the next time `npm run build:dossier-pdf` is run.
 *
 * Fields:
 *   item                 short name, e.g. "Vantrue N5 dashcam"                       (required)
 *   category             "Electronics", "Child seats", "Work equipment", "Personal", "Vehicle accessories", ...
 *   brand / model / serial   optional identifiers
 *   qty                  number of units (default 1)
 *   purchase_price       price paid per unit
 *   purchase_date        YYYY-MM-DD
 *   purchased_from       store or website
 *   claimed_value        total amount claimed for this line; if omitted it is qty x purchase_price
 *   condition            "Destroyed", "Damaged", "Lost" or "Unknown"
 *   location_in_vehicle  where it was, e.g. "Windshield mount", "Cargo area", "Center console"
 *   status               e.g. "Listed with Progressive adjuster", "Receipt requested from Amazon"
 *   proof                ["Receipts_And_Photos/file1.pdf", "Receipts_And_Photos/file2.jpg"]
 *   notes                anything else counsel should know
 */
window.PROPERTY_LOSS_ITEMS = [

  // EXAMPLE ONLY, with made-up values. Copy its shape for a real item; do not simply un-comment it.
  // {
  //   item: "EXAMPLE ONLY - replace with a real item",
  //   category: "Electronics",
  //   brand: "Vantrue", model: "N5",
  //   qty: 1,
  //   purchase_price: 199.99,
  //   purchase_date: "2026-03-10",
  //   purchased_from: "Amazon",
  //   condition: "Destroyed",
  //   location_in_vehicle: "Windshield mount",
  //   status: "Receipt on file",
  //   proof: ["Receipts_And_Photos/dashcam_receipt.pdf"],
  //   notes: "Recorded the on-scene audio; unit case cracked by airbag deployment."
  // },

];
