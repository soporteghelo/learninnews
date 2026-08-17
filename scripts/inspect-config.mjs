const sheetId = '1tKXR0sRb3jZYFrQ8WUVjB3hhIpx1_qbQYfAjJIPPgTA';

async function fetchSheet(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${sheetName}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`No se pudo consultar ${sheetName}: HTTP ${response.status}`);
  }

  return response.text();
}

async function run() {
  try {
    const config = await fetchSheet('CONFIG');
    console.log('--- CONFIG ROWS ---');
    console.log(config);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

run();
