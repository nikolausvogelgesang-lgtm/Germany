// Authored fiction. Each row is [exact source focus, distinct permitted paraphrase].
// The oracle never approves a line merely because the writer returned it.
import {cutoff} from './radio-fixture.mjs';
export const stories=[
  ['cairn','en','Cairn central bank changes collateral rules',[
    ['Cairn Reserve approved a rule allowing participating banks to pledge warehouse receipts when they borrow overnight from its settlement facility.',
     'Banks borrowing overnight at the Cairn Reserve settlement facility will be able to use warehouse receipts as collateral under a rule the reserve approved.'],
    ['Cairn Reserve set the initial lending limit at EUR 12 million per bank for loans secured by receipts rather than government bills.',
     'For a bank that pledges receipts instead of government bills, Cairn Reserve has set an initial borrowing ceiling of EUR 12 million.'],
    ['Cairn Reserve said a receipt qualifies only if an independent warehouse operator confirms the goods remain on its premises.',
     'Cairn Reserve will accept a receipt only if the warehouse operator is independent and confirms that the goods are still there.'],
    ['Cairn Reserve will publish outstanding loans backed by receipts separately from loans backed by government bills in its weekly balance sheet.',
     'Readers of the Cairn Reserve weekly balance sheet will see lending against receipts reported separately from outstanding loans secured by government bills.'],
    ['Cairn Reserve left its overnight interest rate unchanged when it approved the additional collateral for the settlement facility.',
     'Approval of another form of collateral for the settlement facility did not change the rate Cairn Reserve charges for overnight borrowing.'],
  ]],
  ['fen','en','Fen currency auction changes bidding calendar',[
    ['Fen Exchange moved its currency auction to the morning session to allow winning banks to settle their purchases before the clearing desk closes.',
     'Fen Exchange is holding its currency sale in the morning so successful bidders can finish settlement while the clearing desk is open.'],
    ['Fen Exchange retained the existing deposit requirement for banks submitting currency bids under the revised auction timetable.',
     'Although the currency auction has a different timetable, Fen Exchange kept the deposit that bidding banks were already required to provide.'],
    ['Fen Exchange set a ceiling of GBP 8 million on the total currency offered across all bids in the morning session.',
     'Across the morning auction as a whole, Fen Exchange is offering no more than GBP 8 million in currency to bidding banks.'],
    ['Fen Exchange said late bids would be carried into the next auction only with written permission from the bank that submitted them.',
     'Fen Exchange says a bid that arrives late can move to the following currency auction only with written consent from the bank behind it.'],
    ['Fen Exchange plans to publish the weighted average price after settlement without naming the banks that received allocations.',
     'Fen Exchange intends to disclose a weighted average price once settlement ends, but the release will not identify the banks awarded currency.'],
  ]],
  ['wilg','nl','Wilg Cloud past opslagcontracten aan',[
    ['Wilg Cloud laat klanten met een jaarcontract voortaan ongebruikte opslagruimte overhevelen naar de volgende maand binnen dezelfde contractperiode.',
     'Klanten die voor een jaar bij Wilg Cloud tekenen, kunnen hun resterende opslagruimte meenemen naar een volgende maand binnen dat contract.'],
    ['Wilg Cloud stelt een grens van 20 procent aan het deel van de maandelijkse opslagruimte dat een klant mag doorschuiven.',
     'Bij Wilg Cloud mag een klant niet meer dan 20 procent van zijn maandelijkse ruimte bewaren voor gebruik in de volgende maand.'],
    ['Wilg Cloud handhaaft de vaste prijs voor de gereserveerde ruimte, ook wanneer een zakelijke klant een deel daarvan pas later gebruikt.',
     'Voor zakelijke klanten verandert de vaste prijs van Wilg Cloud niet wanneer ze een deel van de gereserveerde opslagruimte later benutten.'],
    ['Volgens Wilg Cloud vervalt het opgebouwde tegoed zodra het jaarcontract afloopt, ook als de klant nog ruimte op zijn rekening heeft staan.',
     'Wilg Cloud zegt dat het einde van het jaarcontract ook het einde van het tegoed betekent, zelfs als er nog opslagruimte over is.'],
    ['Wilg Cloud zal op de maandfactuur apart vermelden hoeveel ruimte uit de afgelopen maand nog beschikbaar is voor de klant.',
     'Een aparte regel op de maandelijkse factuur van Wilg Cloud moet klanten laten zien hoeveel ruimte ze uit de vorige maand overhouden.'],
  ]],
  ['riet','nl','Riet opent aanvraagronde voor AI rekenruimte',[
    ['Riet opent de inschrijving voor gedeelde rekenruimte waar onderzoeksteams hun eigen AI modellen kunnen testen zonder een vaste server te huren.',
     'Onderzoeksteams kunnen zich bij Riet aanmelden om op gedeelde apparatuur eigen AI modellen te testen in plaats van een vaste server te huren.'],
    ['Riet verdeelt de beschikbare uren op basis van een ingediend werkplan en niet op basis van het tijdstip waarop een aanvraag binnenkomt.',
     'Bij de verdeling van rekenuren kijkt Riet naar het werkplan van het team en niet naar de volgorde waarin de aanvragen zijn ontvangen.'],
    ['Riet vraagt ieder team om vooraf te beschrijven welke gegevens tijdens de proeven op de gedeelde apparatuur worden verwerkt.',
     'Teams moeten Riet voor het begin van hun proeven vertellen welke gegevens zij op de gedeelde computers willen gaan verwerken.'],
    ['Riet geeft onderzoeksteams alleen toegang als de beheerder heeft vastgesteld dat hun software gescheiden kan draaien van de andere proeven.',
     'Onderzoekers krijgen bij Riet alleen toegang als de beheerder heeft gecontroleerd dat hun software los van de overige proeven kan draaien.'],
    ['Riet publiceert na de eerste aanvraagronde een overzicht van de toegekende uren zonder de namen van de deelnemende onderzoeksteams te vermelden.',
     'Na afloop van de eerste ronde zal Riet bekendmaken hoeveel uren zijn toegekend, maar de namen van de onderzoeksteams komen niet in dat overzicht.'],
  ]],
  ['auen','de','Öllager in Auenhafen ändert Entgelte für Tankplätze',[
    ['Auenhafen berechnet Händlern die Lagerung von Rohöl künftig nach dem belegten Tankvolumen statt nach der Zahl der gebuchten Plätze.',
     'Für die Lagerung von Rohöl zählt in Auenhafen künftig das Volumen, das ein Händler tatsächlich belegt, nicht mehr die Zahl seiner Tankplätze.'],
    ['Auenhafen nimmt bestehende Jahresverträge von der neuen Abrechnung aus und behält für diese Buchungen den vereinbarten Tarif bis zum Vertragsende bei.',
     'Wer bereits einen Jahresvertrag mit Auenhafen hat, zahlt bis zu dessen Ablauf weiterhin den ursprünglich vereinbarten Preis für seine Buchung.'],
    ['Auenhafen plant für die Erneuerung der Messgeräte Ausgaben von 15 Mio. Euro aus den Rücklagen des Hafenbetriebs.',
     'Die neuen Messgeräte will Auenhafen aus den eigenen Rücklagen bezahlen und sieht dafür Ausgaben in Höhe von 15 Millionen Euro vor.'],
    ['Auenhafen lässt eine Korrektur der Rechnung nur zu, wenn ein unabhängiger Prüfer einen Fehler bei der Erfassung des Volumens bestätigt.',
     'Eine Rechnung wird in Auenhafen nur dann berichtigt, wenn ein unabhängiger Prüfer bestätigt, dass das belegte Volumen falsch erfasst wurde.'],
    ['Auenhafen wird auf der Monatsrechnung die Kosten der Messung separat ausweisen und vom Entgelt für den belegten Tankraum trennen.',
     'Auf den monatlichen Rechnungen von Auenhafen sollen Kunden die Messkosten und die Gebühr für ihren Tankraum künftig als getrennte Posten sehen.'],
  ]],
  ['erlental','de','Erlental Energie schreibt Netzreserve für den Winter aus',[
    ['Erlental Energie sucht für den Winter Betreiber von Batteriespeichern, die bei einem Ausfall der örtlichen Umspannstation Strom bereitstellen können.',
     'Für den Fall einer Störung an der lokalen Umspannstation will Erlental Energie im Winter auf Strom aus den Batterien externer Betreiber zurückgreifen.'],
    ['Erlental Energie begrenzt die ausgeschriebene Leistung auf 12 Megawatt und akzeptiert auch gemeinsame Angebote kleinerer Speicherbetreiber.',
     'Auch kleinere Betreiber dürfen sich bei Erlental Energie mit einem gemeinsamen Angebot um die insgesamt ausgeschriebenen 12 Megawatt bewerben.'],
    ['Erlental Energie unterscheidet bei der Vergütung zwischen der zugesagten Bereitschaft und der tatsächlich aus den Batterien gelieferten Strommenge.',
     'Erlental Energie will die Bereitschaft der Speicher gesondert bezahlen und sie von der Abrechnung des tatsächlich gelieferten Stroms trennen.'],
    ['Erlental Energie verlangt vor der Vergabe einen Funktionstest unter Aufsicht der Netzleitstelle für jeden angebotenen Speicher.',
     'Bevor Erlental Energie einen Auftrag vergibt, muss jeder angebotene Speicher bei einem von der Netzleitstelle beaufsichtigten Test seine Funktion nachweisen.'],
    ['Erlental Energie veröffentlicht nach Abschluss der Vergabe den durchschnittlichen Zuschlagspreis, nennt aber die Namen der einzelnen Anbieter nicht.',
     'Nach der Vergabe soll der mittlere Zuschlagspreis bei Erlental Energie öffentlich werden, während die Namen der erfolgreichen Anbieter ungenannt bleiben.'],
  ]],
];
export const articles=stories.map(([id,language,headline,rows])=>({id,language,headline,text:rows.map(r=>r[0]).join(' '),date:cutoff,
  dateMs:Date.parse(cutoff),outlet:`QA ${id}`,url:`https://example.test/${id}`}));
export const news=articles.map(a=>[a]);
export function fixtureDraft(input) {
  return input.articles.flatMap(a=>a.passages.flatMap(p=>{
    const focus=p.focusRange?p.quote.slice(...p.focusRange):p.quote;
    const row=stories.find(s=>s[0]===a.articleId)?.[3].find(r=>r[0]===focus);
    return row?[{text:row[1],evidenceIndex:p.evidenceIndex,articleId:a.articleId}]:[];
  }));
}
export function fixtureVerdicts(input) {
  return input.claims.map(c=>{
    const supported=stories.some(([id,lang,,rows])=>id===c.articleId && lang===input.language && articles.find(a=>a.id===id).text.includes(c.quote) &&
      rows.some(([focus,spoken])=>(c.focus??c.quote)===focus && c.quote.includes(focus) && c.claim===spoken));
    return {id:c.id,supported,reason:supported?'ok':'unsupported_claim'};
  });
}
