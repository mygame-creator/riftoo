(async () => {
  const apply = s => document.documentElement.style.setProperty('--accent', s.accent);
  apply(await rift.settings.get());
  rift.settings.onChange(apply);
})();
