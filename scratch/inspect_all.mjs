const sheetId = '1fXcrk-6YSA5NcgDbCBinu4WaPpyJMRK0og6miVE8ZZw';

async function fetchSheet(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${sheetName}`;
  const res = await fetch(url);
  const text = await res.text();
  return text;
}

async function run() {
  try {
    const config = await fetchSheet('CONFIG');
    console.log('--- CONFIG ROWS ---');
    console.log(config);
  } catch (err) {
    console.error(err);
  }
}

run();
