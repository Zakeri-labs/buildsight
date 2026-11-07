// Legacy tests in this repo assert with console.assert, which only logs.
// Make a failed console.assert fail the running test instead.
const originalAssert = console.assert.bind(console)
console.assert = (condition?: boolean, ...data: unknown[]) => {
  if (!condition) {
    originalAssert(condition, ...data)
    throw new Error(`Assertion failed: ${data.map(String).join(" ")}`)
  }
}
