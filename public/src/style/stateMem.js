export const stateMem = {
  currentStyleAttr: null,
  boundStyleType: {},       // { [attrKey]: 'fontColor' | 'borderColor' | 'backgroundColor' | 'fontFamily' | 'haloColor' | 'none' }
  styleTypeOwner: {},       // { [styleKey]: attrKey }
  styleRules: {},           // { [attrKey]: Array<{ id, type, style: {}, values: string[] }> }
  styleRowSelections: {},   // { [rowId]: string[] }
};
