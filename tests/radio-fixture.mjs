// Authored QA material only; never loaded by the product. [source sentence,
// mocked writer output]. No actual journalism, providers or predictions.
export const testStories = [
  ['harbour','Harbour fee proposal',[
    ['Tideglass Port has proposed dropping its overnight storage charge for crates that are already waiting on an inspection.',
     'Under a proposal from Tideglass Port, crates held overnight for an inspection would no longer attract a storage fee.'],
    ['The port says its existing rules charge the shipper even when an inspector rather than the shipper decides how long the crates stay.',
     'As the port explains it, the shipper currently pays for the wait even when the inspector controls the timetable.'],
    ['Crates kept on the quay because a customer has not arranged collection would still incur a charge under the proposal.',
     'A customer who leaves crates on the quay without arranging collection would still face the charge under the proposed rules.'],
    ['The port has asked shipping companies to record which part of each delay was spent waiting for inspection staff.',
     'To separate those delays, Tideglass wants shippers to log the time they spend waiting specifically for an inspector.'],
    ['No starting date will be set for the change until the harbour committee finishes reviewing the proposed fee schedule.',
     'There is no start date yet: the harbour committee still has to complete its review of the fee proposal.'],
  ]],
  ['mill','Quarterly mill accounts',[
    ['Juniper Mill reported that it invoiced less for paper in the spring quarter despite sending customers a larger volume of paper.',
     'Juniper Mill shipped more paper during the spring quarter, but billed customers less for those shipments than before.'],
    ['Juniper attributed the gap between shipments and billings to a shift from coated sheets toward cheaper uncoated paper.',
     'Juniper traced the difference to the mix of paper it sold, as customers took more of the less expensive uncoated sheets.'],
    ['The mill counts a shipment when it leaves the warehouse rather than when a customer pays for the goods.',
     'In the mill’s accounts, dispatch from the warehouse counts as a shipment regardless of when the customer actually pays.'],
    ['A note in the accounts says that the mill kept its posted price for coated sheets unchanged throughout the quarter.',
     'The accounts make a distinction on pricing: Juniper left its published price for coated sheets alone during the quarter.'],
    ['Juniper did not say whether the shift toward cheaper grades had continued after the close of the reporting period.',
     'What happened after the quarter is less clear, because Juniper did not report whether customers kept switching to cheaper grades.'],
  ]],
  ['depot','Cooperative opens order book',[
    ['In a trial announced by Alder Cooperative, members can reserve space at its cold store before a delivery leaves their farm.',
     'Alder Cooperative is testing advance reservations for cold storage so that members can book space before sending a delivery from the farm.'],
    ['According to the cooperative, its former practice was to allocate available rooms when a delivery truck reached the depot.',
     'Previously the truck had to arrive at the depot before the cooperative allocated a room from what was available.'],
    ['In the trial, a reservation sets aside space but does not lock in the price that the grower will pay for storage.',
     'A reservation secures room at the depot, but the cooperative says it does not fix the storage price for the grower.'],
    ['The cooperative is keeping its existing queue for growers who bring goods to the depot without making a booking.',
     'Growers can still arrive without booking ahead, in which case the cooperative will use its existing queue for their deliveries.'],
    ['The cooperative plans to compare the time trucks spend at its gate before deciding whether to keep the trial scheme.',
     'Alder says it will compare truck waiting times at the gate before making a decision about keeping advance reservations.'],
  ]],
];
export const cutoff = '2026-11-19T23:59:59Z';
export const groups = testStories.map(([id,headline,rows]) => [{
  id,headline,text:rows.map(r=>r[0]).join(' '),date:cutoff,dateMs:Date.parse(cutoff),
  language:'en',outlet:'Fictional QA desk',url:'https://example.test/'+id,
}]);
export const draft = testStories.flatMap(([articleId,,rows]) => rows.map(([,text],evidenceIndex) => ({text,articleId,evidenceIndex})));
export const output = value => Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}],usage:{input_tokens:1,output_tokens:1}});
