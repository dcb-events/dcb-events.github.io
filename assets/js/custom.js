/*
const queryParams = new URLSearchParams(window.location.search)
const scenarioEncoded = queryParams.get('scenario')
if (scenarioEncoded !== null) {
  let scenarioResponse = await fetch(scenarioEncoded)
  if (scenarioResponse.body === null) {
    console.error('Failed to parse scenario data (e1)')
    return
  }
  if (scenarioResponse.headers.get('Content-Type')?.includes('+gzip')) {
    scenarioResponse = new Response(
      scenarioResponse.body.pipeThrough(
        new DecompressionStream('deflate-raw')
      )
    )
  }
  const scenarioJson = await scenarioResponse.text()
  try {
    this.configuration = JSON.parse(scenarioJson)
  } catch (e) {
    console.error('Failed to parse scenario data (e2)')
  }
}
  */