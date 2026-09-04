/*
 * injury_photos.js — captions for the photographs in Pictures_Of_Bruises/.
 *
 * TO ADD A PHOTO: copy the image file into Pictures_Of_Bruises/ (any .jpg, .jpeg, .png, .webp or .heic).
 * It appears in the gallery on this binder's page automatically the next time the page is loaded.
 * Then add one entry below so it carries a date, body region and description (copy any block).
 * Photos without an entry are shown with an "awaiting caption" marker so nothing is silently missing.
 *
 * Fields:
 *   file     exact file name inside Pictures_Of_Bruises/                      (required)
 *   date     YYYY-MM-DD when the photo was taken (from the phone's metadata if possible)
 *   time     optional, e.g. "2:35 PM"
 *   region   body region, e.g. "Left knee", "Chest (airbag burn)", "Neck, left side"
 *   caption  what is visible, in plain words; say if a doctor has or has not seen it
 *   source   who took it and with what, e.g. "Client selfie, iPhone (EXIF date)"
 */
window.INJURY_PHOTOS = {
  folder: "Pictures_Of_Bruises",
  photos: [
    {
      file: "IMG_9304.jpeg",
      date: "2026-08-29",
      time: "2:35 PM CDT",
      region: "Neck and neck-shoulder junction (client reports left side)",
      caption: "One diagonal reddish-pink linear mark running from the side of the neck near the shoulder toward the front base of the neck, photographed about 33½ hours after the collision. The client attributes it to the seat belt. The dossier (§9.3) quotes the 08/28 ED exam as noting no seat-belt sign; that exam note is not among the binder's files. The 08/30 Texas Health Frisco and 09/02 UTSW records note patient-reported neck bruising.",
      source: "Client selfie, iPhone 16 Pro Max front camera (date and time from the file's EXIF metadata; the image also carries embedded GPS coordinates)"
    }
  ]
};
