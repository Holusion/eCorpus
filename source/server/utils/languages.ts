
export const sceneLanguages = ["EN", "ES", "DE", "NL", "JA", "FR", "HAW"] as const;
export type SceneLanguage = typeof sceneLanguages[number];

export const uiLanguages = ["EN", "FR"] as const;
export type UILanguage = typeof uiLanguages[number];


export function isSceneLanguage(l: any): l is SceneLanguage | undefined {
  return typeof l === "undefined" || sceneLanguages.indexOf(l) !== -1;
}


export function isUILanguage(l: any): l is UILanguage | undefined {
  return typeof l === "undefined" || uiLanguages.indexOf(l) !== -1;
}
