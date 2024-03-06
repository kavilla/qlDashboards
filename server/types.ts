import { DataPluginSetup } from "src/plugins/data/server/plugin";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface QlDashboardsPluginSetup {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface QlDashboardsPluginStart {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface QlDashboardsPluginSetupDependencies {
  data: DataPluginSetup;
}

export interface ISchema {
  name: string;
  type: string;
}

export interface IPPLVisualizationDataSource {
  data: any;
  metadata: any;
  jsonData?: any[];
  size: number;
  status: number;
}

export interface IPPLEventsDataSource {
  schema: ISchema[];
  datarows: any[];
  jsonData?: any[];
}
