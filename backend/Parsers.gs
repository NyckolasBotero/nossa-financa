/**
 * NOSSA FINANÇA — Parsers.gs
 * Funções puras de leitura de texto: notificações bancárias e contracheque.
 * São heurísticas: o app SEMPRE mostra o resultado para o usuário conferir antes de gravar.
 */

function normalize_(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** "1.234,56" -> 1234.56 ; "1234.56" -> 1234.56 ; "1.234" -> 1234 */
function parseMoney_(s) {
  let t = String(s).replace(/[^\d.,]/g, '');
  if (!t) return null;
  if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
  else if (!/^\d+\.\d{1,2}$/.test(t)) t = t.replace(/\./g, '');
  const n = parseFloat(t);
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
}

const BANKS_ = [
  ['nubank', 'Nubank'], ['itau', 'Itaú'], ['bradesco', 'Bradesco'], ['santander', 'Santander'], ['banco inter', 'Inter'],
  ['inter', 'Inter'], ['c6', 'C6 Bank'], ['caixa', 'Caixa'], ['banco do brasil', 'Banco do Brasil'], ['picpay', 'PicPay'],
  ['mercado pago', 'Mercado Pago'], ['sicredi', 'Sicredi'], ['sicoob', 'Sicoob'], ['neon', 'Neon'], ['will bank', 'Will Bank'],
  ['pagbank', 'PagBank'], ['bnb', 'Banco do Nordeste'], ['btg', 'BTG'], ['xp', 'XP'], ['alelo', 'Alelo'], ['sodexo', 'Sodexo'],
  ['ticket', 'Ticket'], ['vr ', 'VR'], ['ifood benef', 'iFood Benefícios']
];

function parseNotification_(text, app, categories) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  const norm = normalize_(raw);
  const out = { amount: null, merchant: '', institution: '', type: 'expense', categoryId: '', confidence: 'low' };

  // valor: primeiro R$ que não seja saldo/limite; prefere o que vem depois de "valor"
  const re = /R\$\s*([\d]{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)/gi;
  let m, first = null, preferred = null;
  while ((m = re.exec(raw))) {
    const before = normalize_(raw.slice(Math.max(0, m.index - 18), m.index));
    if (/saldo|limite|disponivel/.test(before)) continue;
    const v = parseMoney_(m[1]);
    if (v === null) continue;
    if (first === null) first = v;
    if (/valor( de| da| do)?\s*$/.test(before) && preferred === null) preferred = v;
  }
  out.amount = preferred !== null ? preferred : first;

  // tipo: vence a palavra-chave que aparece primeiro
  const inc = /(voce recebeu|recebeu um pix|pix recebido|recebeu uma transferencia|transferencia recebida|ted recebida|doc recebido|deposito|credito em conta|salario|estorno|reembolso|cashback|rendimento|recebimento)/.exec(norm);
  const exp = /(compra|pagamento|pague|pix enviado|voce enviou|enviou um pix|transferencia enviada|voce transferiu|transferiu|debito|saque|fatura|boleto|pagou|cobranca|assinatura|recarga)/.exec(norm);
  if (inc && (!exp || inc.index < exp.index)) { out.type = 'income'; out.confidence = 'medium'; }
  else if (exp) { out.type = 'expense'; out.confidence = 'medium'; }

  // estabelecimento / pessoa
  const stop = '(?=\\s+(?:no valor|valor|por R\\$|R\\$|no cart[aã]o|com final|final \\d|[àa]s \\d|em \\d{2}\\/|hoje|agora)|[.,;]|$)';
  let mm = new RegExp('(?:compra|pagamento|d[eé]bito)[^.]*?\\b(?:em|no|na)\\s+(?!cart[aã]o|valor|conta)([^,.;]+?)' + stop, 'i').exec(raw);
  if (!mm) mm = new RegExp('\\b(?:[Dd]e|[Pp]ara)\\s+([A-ZÀ-Ú][^,.;]{2,40}?)' + stop).exec(raw);
  if (!mm) mm = new RegExp('\\b(?:em|no|na)\\s+([A-Z0-9][A-Z0-9 *.&\'-]{2,30})' + stop).exec(raw);
  if (mm) out.merchant = mm[1].replace(/\s+/g, ' ').replace(/^(?:o|a)\s+/i, '').trim().slice(0, 60);

  // instituição
  const hay = normalize_(app) + ' ' + norm;
  for (let i = 0; i < BANKS_.length; i++) {
    if (hay.indexOf(BANKS_[i][0]) >= 0) { out.institution = BANKS_[i][1]; break; }
  }

  // categoria sugerida: palavra-chave mais específica (mais longa) que aparece no texto
  const hayCat = normalize_(out.merchant + ' ' + raw);
  let best = 0;
  (categories || []).forEach(function (c) {
    if (c.type !== out.type || !c.keywords) return;
    String(c.keywords).split(',').forEach(function (k) {
      const kw = normalize_(k);
      if (kw.length >= 2 && kw.length > best && new RegExp('(^|[^a-z0-9])' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)').test(hayCat)) { best = kw.length; out.categoryId = c.id; }
    });
  });
  if (out.amount !== null && out.merchant) out.confidence = 'high';
  return out;
}

// ---------------------------------------------------------------- OCR (Drive)

/** Converte PDF/imagem em texto usando o OCR do Drive (serviço avançado "Drive API" v2). */
function ocrToText_(blob) {
  if (typeof Drive === 'undefined' || !Drive.Files) {
    throw fail_('OCR_UNAVAILABLE', 'Ative o serviço "Drive API" (v2) no Apps Script para ler contracheques.');
  }
  let file;
  try {
    file = Drive.Files.insert({ title: 'tmp-ocr-' + uid_(), mimeType: blob.getContentType() }, blob, { ocr: true, ocrLanguage: 'pt' });
    return DocumentApp.openById(file.id).getBody().getText();
  } catch (e) {
    throw fail_('OCR_FAILED', 'Não consegui ler o arquivo. Tente outro PDF ou uma foto mais nítida.');
  } finally {
    if (file && file.id) { try { Drive.Files.remove(file.id); } catch (e2) { /* ignore */ } }
  }
}

// ---------------------------------------------------------------- contracheque

const MONTHS_PT_ = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const PAYSLIP_LABELS_ = {
  gross: /total (de |dos )?(vencimentos|proventos)|salario bruto|total bruto|rendimentos totais/,
  discounts: /total (de |dos |das )?(descontos|deducoes)|descontos totais/,
  net: /liquido( a receber| do mes)?|valor liquido|total liquido/
};

function parsePayslipText_(text) {
  const lines = String(text || '').split(/\r?\n/).map(function (s) { return s.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
  const out = { competence: '', gross: null, discounts: null, net: null, items: [], warnings: [] };
  const moneyRe = /\d{1,3}(?:\.\d{3})*,\d{2}/;

  // competência
  const flat = normalize_(lines.join(' \n '));
  let c = /(?:competencia|referencia|mes\/ano|periodo)[^\d\n]{0,15}(\d{2})\s*[\/.-]\s*(\d{4})/.exec(flat);
  if (c) out.competence = c[2] + '-' + c[1];
  else {
    c = new RegExp('(' + MONTHS_PT_.join('|') + ')\\s*(?:de|\\/)?\\s*(\\d{4})').exec(flat);
    if (c) out.competence = c[2] + '-' + ('0' + (MONTHS_PT_.indexOf(c[1]) + 1)).slice(-2);
  }

  // totais: primeiro valor depois do rótulo (mesma linha ou até 2 linhas abaixo)
  function findAfter(labelRe) {
    for (let i = 0; i < lines.length; i++) {
      const n = normalize_(lines[i]), m = labelRe.exec(n);
      if (!m) continue;
      const tail = lines[i].slice(Math.min(m.index + m[0].length, lines[i].length));
      let v = moneyRe.exec(tail);
      for (let k = 1; !v && k <= 2 && i + k < lines.length; k++) v = moneyRe.exec(lines[i + k]);
      if (v) return parseMoney_(v[0]);
    }
    return null;
  }
  out.gross = findAfter(PAYSLIP_LABELS_.gross);
  out.discounts = findAfter(PAYSLIP_LABELS_.discounts);
  out.net = findAfter(PAYSLIP_LABELS_.net);

  // itens (linhas de rubrica com um valor no fim)
  const rowRe = /^(?:\d{1,5}\s+)?(.{3,45}?)\s+(?:\d{1,3}(?:[.,]\d{1,2})?\s*%?\s+)?(\d{1,3}(?:\.\d{3})*,\d{2})\s*([CD])?$/;
  const seen = {};
  lines.forEach(function (ln) {
    const n = normalize_(ln);
    if (PAYSLIP_LABELS_.gross.test(n) || PAYSLIP_LABELS_.discounts.test(n) || PAYSLIP_LABELS_.net.test(n) || /^base|base de calculo|salario base|fgts mes/.test(n)) return;
    const m = rowRe.exec(ln);
    if (!m) return;
    const label = m[1].replace(/\s+/g, ' ').trim();
    if (!/[A-Za-zÀ-ú]{3}/.test(label)) return;
    const value = parseMoney_(m[2]);
    const ln2 = normalize_(label);
    let kind = m[3] === 'D' ? 'discount' : 'earning';
    if (/inss|irrf|\bir\b|imposto|desconto|plano|vale|contribuicao|previd|falta|adiantamento|consignado|sindical|coparticipacao/.test(ln2)) kind = 'discount';
    if (/fgts/.test(ln2)) kind = 'info';
    const key = ln2 + '|' + value;
    if (seen[key]) return; seen[key] = 1;
    out.items.push({ label: label, value: value, kind: kind });
  });

  // reconciliação
  const sum = function (k) { return Math.round(out.items.filter(function (i) { return i.kind === k; }).reduce(function (a, i) { return a + i.value; }, 0) * 100) / 100; };
  if (out.gross === null && out.items.some(function (i) { return i.kind === 'earning'; })) { out.gross = sum('earning'); out.warnings.push('Bruto calculado pela soma dos proventos encontrados.'); }
  if (out.discounts === null && out.items.some(function (i) { return i.kind === 'discount'; })) { out.discounts = sum('discount'); out.warnings.push('Descontos calculados pela soma das linhas encontradas.'); }
  if (out.net === null && out.gross !== null && out.discounts !== null) { out.net = Math.round((out.gross - out.discounts) * 100) / 100; out.warnings.push('Líquido calculado (bruto menos descontos).'); }
  if (out.net === null) out.warnings.push('Não encontrei o valor líquido. Informe manualmente.');
  if (out.gross !== null && out.discounts !== null && out.net !== null && Math.abs(out.gross - out.discounts - out.net) > 0.05) {
    out.warnings.push('Bruto, descontos e líquido não fecham. Confira os valores.');
  }
  if (!out.competence) out.warnings.push('Não identifiquei a competência (mês/ano).');
  return out;
}
