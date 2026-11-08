function hasExtension(specifier) {
  return /\.[a-z0-9]+$/i.test(specifier)
}

export async function resolve(specifier, context, nextResolve) {
  const relative = specifier.startsWith('./') || specifier.startsWith('../')
  if (relative && !hasExtension(specifier)) {
    return nextResolve(`${specifier}.ts`, context)
  }
  return nextResolve(specifier, context)
}
