const siteTitle = "Keluarga Alumni SMAN Sumatera Selatan";

export function pageTitle(page?: string) {
  return page ? `${page} | ${siteTitle}` : siteTitle;
}
