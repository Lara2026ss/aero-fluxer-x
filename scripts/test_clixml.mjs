const sample = '<Objs Version="1.1.0.1" xmlns="http://schemas.microsoft.com/powershell/2004/04"><S S="Error">Get-Process : No se encuentra ning_x00FA_n proceso con el t_x00E9_rmino especificado._x000D__x000A_</S><S S="Error">En l_x00ED_nea: 1 Car_x00E1_cter: 1_x000D__x000A_</S></Objs>';

function cleanCliXml(text) {
  if (!text || typeof text !== "string") return "";
  if (!text.includes("<Objs") && !text.includes("#< CLIXML")) {
    return text.trim();
  }
  const stringRegex = /<S S="(?:Error|Warning|Information|Verbose)">(.*?)<\/S>/gs;
  const matches = [];
  let match;
  while ((match = stringRegex.exec(text)) !== null) {
    let unescaped = match[1]
      .replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, "\"")
      .replace(/&apos;/g, "'");
    matches.push(unescaped);
  }
  if (matches.length > 0) {
    return matches.join("").trim();
  }
  return text
    .replace(/#<\s*CLIXML/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .trim();
}

console.log("RESULTADO DECODIFICADO:");
console.log(cleanCliXml(sample));
