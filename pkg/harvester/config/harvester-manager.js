import { HCI, MANAGEMENT, CAPI } from '@shell/config/types';
import { HARVESTER, MULTI_CLUSTER } from '@shell/store/features';
import { STATE, NAME as NAME_COL, AGE, VERSION } from '@shell/config/table-headers';
import { MACHINE_POOLS } from '../config/table-headers';
import { allHash } from '@shell/utils/promise';
import { BLANK_CLUSTER } from '@shell/store/store-types.js';

export const PRODUCT_NAME = 'harvester-manager';

export const NAME = 'harvesterManager';

const harvesterClustersLocation = {
  name:   'c-cluster-product-resource',
  params: {
    cluster:  BLANK_CLUSTER,
    product:  NAME,
    resource: HCI.CLUSTER
  }
};

export function init($plugin, store) {
  const {
    product,
    basicType,
    headers,
    spoofedType,
    configureType
  } = $plugin.DSL(store, NAME);

  product({
    ifHaveType:          CAPI.RANCHER_CLUSTER,
    ifFeature:           [MULTI_CLUSTER, HARVESTER],
    inStore:             'management',
    icon:                'harvester',
    removable:           false,
    showClusterSwitcher: false,
    weight:              100,
    to:                  harvesterClustersLocation,
    category:            'hci',
  });

  configureType(HCI.CLUSTER, { showListMasthead: false });
  headers(HCI.CLUSTER, [
    STATE,
    NAME_COL,
    {
      name:     'harvesterVersion',
      sort:     'harvesterVersion',
      labelKey: 'harvesterManager.tableHeaders.harvesterVersion',
      value:    'harvesterVersion',
      getValue: (row) => row.harvesterVersion
    },
    {
      ...VERSION,
      labelKey: 'harvesterManager.tableHeaders.kubernetesVersion',
      value:    'kubernetesVersion',
      getValue: (row) => row.kubernetesVersion
    },
    MACHINE_POOLS,
    AGE,
    {
      name:  'harvester',
      label: ' ',
      align: 'right',
      width: 65,
    },
  ]);
  basicType([HCI.CLUSTER]);
  spoofedType({
    labelKey:   'harvesterManager.cluster.label',
    name:       HCI.CLUSTER,
    type:       HCI.CLUSTER,
    namespaced: false,
    weight:     -1,
    route:      {
      name:   'c-cluster-product-resource',
      params: {
        product:  NAME,
        resource: HCI.CLUSTER,
      }
    },
    exact:   false,
    schemas: [
      {
        id:                HCI.CLUSTER,
        type:              'schema',
        collectionMethods: [],
        resourceFields:    {},
        attributes:        { namespaced: true },
      },
    ],
    group:        'Root',
    getInstances: async() => {
      const hash = {
        rancherClusters: store.dispatch('management/findAll', { type: CAPI.RANCHER_CLUSTER }),
        clusters:        store.dispatch('management/findAll', { type: MANAGEMENT.CLUSTER }),
      };

      if (store.getters['management/schemaFor'](MANAGEMENT.NODE)) {
        hash.nodes = store.dispatch('management/findAll', { type: MANAGEMENT.NODE });
      }

      const res = await allHash(hash);

      return res.rancherClusters.map((c) => {
        return {
          ...c,
          type: HCI.CLUSTER,
        };
      });
    },
  });
}
