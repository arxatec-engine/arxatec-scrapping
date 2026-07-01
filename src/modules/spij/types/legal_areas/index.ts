export interface SubareaDef {
  id: string;
  name: string;
}
export interface AreaDef {
  id: string;
  area: string;
  subareas: SubareaDef[];
}
export interface Catalog {
  default_area?: string;
  areas: AreaDef[];
  [k: string]: unknown;
}

export interface Area {
  legal_area: string;
  subarea: string;
  legal_area_id: string | null;
  legal_subarea_id: string | null;
}
