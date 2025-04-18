<script>
import { mapGetters } from 'vuex';
import Tag from '@shell/components/Tag';
import Tabbed from '@shell/components/Tabbed';
import Tab from '@shell/components/Tabbed/Tab';
import InfoBox from '@shell/components/InfoBox';
import LabelValue from '@shell/components/LabelValue';
import ArrayListGrouped from '@shell/components/form/ArrayListGrouped';
import Loading from '@shell/components/Loading.vue';
import SortableTable from '@shell/components/SortableTable';
import Banner from '@components/Banner/Banner.vue';
import { UNIT_SUFFIX } from '../../utils/unit';
import metricPoller from '@shell/mixins/metric-poller';
import {
  METRIC, NODE, LONGHORN, POD, EVENT
} from '@shell/config/types';
import { HCI as HCI_ANNOTATIONS } from '@pkg/harvester/config/labels-annotations';
import { allHash } from '@shell/utils/promise';
import { formatSi } from '@shell/utils/units';
import { findBy } from '@shell/utils/array';
import { clone } from '@shell/utils/object';
import { escapeHtml } from '@shell/utils/string';
import { HCI } from '../../types';

import Basic from './HarvesterHostBasic';
import Instance from './VirtualMachineInstance';
import Disk from './HarvesterHostDisk';
import VlanStatus from './VlanStatus';
import HarvesterKsmtuned from './HarvesterKsmtuned.vue';
import HarvesterSeeder from './HarvesterSeeder';

const LONGHORN_SYSTEM = 'longhorn-system';

export default {
  name: 'DetailHost',

  components: {
    Tabbed,
    Tab,
    Tag,
    Basic,
    Instance,
    ArrayListGrouped,
    Disk,
    InfoBox,
    VlanStatus,
    LabelValue,
    HarvesterKsmtuned,
    Loading,
    SortableTable,
    HarvesterSeeder,
    Banner,
  },
  mixins: [metricPoller],

  props: {
    value: {
      type:     Object,
      required: true,
    },
  },

  async fetch() {
    const inStore = this.$store.getters['currentProduct'].inStore;

    const hash = {
      nodes: this.$store.dispatch('harvester/findAll', { type: NODE }),
      pods:  this.$store.dispatch(`${ inStore }/findAll`, { type: POD }),
    };

    if (this.$store.getters['harvester/schemaFor'](HCI.VLAN_STATUS)) {
      hash.hostNetworks = this.$store.dispatch('harvester/findAll', { type: HCI.VLAN_STATUS });
    }

    if (this.$store.getters['harvester/schemaFor'](HCI.BLOCK_DEVICE)) {
      hash.blockDevices = this.$store.dispatch('harvester/findAll', { type: HCI.BLOCK_DEVICE });
    }

    if (this.$store.getters['harvester/schemaFor'](LONGHORN.NODES)) {
      hash.longhornNodes = this.$store.dispatch('harvester/findAll', { type: LONGHORN.NODES });
    }

    if (this.$store.getters['harvester/schemaFor'](HCI.LINK_MONITOR)) {
      hash.linkMonitors = this.$store.dispatch('harvester/findAll', { type: HCI.LINK_MONITOR });
    }

    if (this.$store.getters['harvester/schemaFor'](HCI.ADD_ONS)) {
      hash.addons = this.$store.dispatch(`${ inStore }/findAll`, { type: HCI.ADD_ONS });
    }

    if (this.$store.getters['harvester/schemaFor'](HCI.INVENTORY)) {
      hash.inventories = this.$store.dispatch(`${ inStore }/findAll`, { type: HCI.INVENTORY });
    }

    const res = await allHash(hash);
    const hostNetworkResource = (res.hostNetworks || []).find( (O) => this.value.id === O.attachNodeName);

    this.loadMetrics();

    if (hostNetworkResource) {
      this.hostNetworkResource = hostNetworkResource;
    }

    const blockDevices = this.$store.getters[`${ inStore }/all`](HCI.BLOCK_DEVICE);
    const provisionedBlockDevices = blockDevices.filter((d) => {
      const isCurrentNode = d?.spec?.nodeName === this.value.id;
      const isLonghornMounted = findBy(this.longhornDisks, 'name', d.metadata.name);

      return d?.isProvisioned && isCurrentNode && !isLonghornMounted;
    })
      .map((d) => {
        return {
          isNew:          true,
          name:           d?.metadata?.name,
          originPath:     d?.spec?.fileSystem?.mountPoint,
          path:           d?.spec?.fileSystem?.mountPoint,
          blockDevice:    d,
          displayName:    d?.displayName,
          forceFormatted: d?.spec?.fileSystem?.forceFormatted || false,
        };
      });

    const disks = [...this.longhornDisks, ...provisionedBlockDevices];

    this.disks = disks;
    this.newDisks = clone(disks);

    const addons = this.$store.getters[`${ inStore }/all`](HCI.ADD_ONS);
    const seeder = addons.find((addon) => addon.id === 'harvester-system/harvester-seeder');

    const seederEnabled = seeder ? seeder?.spec?.enabled : false;

    if (seederEnabled) {
      const inStore = this.$store.getters['currentProduct'].inStore;
      const inventories = this.$store.getters[`${ inStore }/all`](HCI.INVENTORY) || [];

      const inventory = inventories.find((inv) => inv.id === `harvester-system/${ this.value.id }`);

      if (inventory) {
        this.inventory = inventory;
      } else {
        this.inventory = await this.$store.dispatch(`${ inStore }/create`, {
          type:     HCI.INVENTORY,
          metadata: {
            name:      this.value.id,
            namespace: 'harvester-system'
          },
        });

        this.inventory.applyDefaults();
      }
    }
  },

  data() {
    return {
      metrics:             null,
      mode:                'view',
      hostNetworkResource: null,
      newDisks:            [],
      disks:               [],
      allEvents:           [],
      didLoadEvents:       false,
      inventory:           {},
    };
  },

  computed: {
    ...mapGetters({ t: 'i18n/t' }),
    longhornDisks() {
      const inStore = this.$store.getters['currentProduct'].inStore;
      const longhornNode = this.$store.getters[`${ inStore }/byId`](LONGHORN.NODES, `longhorn-system/${ this.value.id }`);
      const diskStatus = longhornNode?.status?.diskStatus || {};
      const diskSpec = longhornNode?.spec?.disks || {};

      const formatOptions = {
        increment:    1024,
        minExponent:  3,
        maxExponent:  3,
        maxPrecision: 2,
        suffix:       UNIT_SUFFIX,
      };

      const longhornDisks = Object.keys(diskStatus).map((key) => {
        const blockDevice = this.$store.getters[`${ inStore }/byId`](HCI.BLOCK_DEVICE, `longhorn-system/${ key }`);

        return {
          ...diskStatus[key],
          ...diskSpec?.[key],
          name:             key,
          isNew:            false,
          storageReserved:  formatSi(diskSpec[key]?.storageReserved, formatOptions),
          storageAvailable: formatSi(diskStatus[key]?.storageAvailable, formatOptions),
          storageMaximum:   formatSi(diskStatus[key]?.storageMaximum, formatOptions),
          storageScheduled: formatSi(diskStatus[key]?.storageScheduled, formatOptions),
          blockDevice,
          displayName:      blockDevice?.displayName || key,
          forceFormatted:   blockDevice?.spec?.fileSystem?.forceFormatted || false,
          tags:             diskSpec?.[key]?.tags || [],
        };
      });

      return longhornDisks;
    },

    hasKsmtunedSchema() {
      const inStore = this.$store.getters['currentProduct'].inStore;

      return !!this.$store.getters[`${ inStore }/schemaFor`](HCI.KSTUNED);
    },

    hasBlockDevicesSchema() {
      return !!this.$store.getters['harvester/schemaFor'](HCI.BLOCK_DEVICE);
    },

    hasHostNetworksSchema() {
      return !!this.$store.getters['harvester/schemaFor'](HCI.VLAN_STATUS);
    },

    vlanStatuses() {
      const inStore = this.$store.getters['currentProduct'].inStore;
      const nodeId = this.value.id;
      const vlanStatuses = this.$store.getters[`${ inStore }/all`](HCI.VLAN_STATUS);

      return vlanStatuses.filter((s) => s?.status?.node === nodeId) || [];
    },

    longhornNode() {
      const inStore = this.$store.getters['currentProduct'].inStore;
      const longhornNodes = this.$store.getters[`${ inStore }/all`](LONGHORN.NODES);

      return longhornNodes.find((node) => node.id === `${ LONGHORN_SYSTEM }/${ this.value.id }`);
    },

    events() {
      return this.allEvents.filter((event) => {
        return event.involvedObject?.uid === this.value?.metadata?.uid &&
                event.reason !== 'SeederUpdated';
      }).map((event) => {
        return {
          reason:    (`${ event.reason || this.t('generic.unknown') }${ event.count > 1 ? ` (${ event.count })` : '' }`).trim(),
          message:   event.message || this.t('generic.unknown'),
          date:      event.lastTimestamp || event.firstTimestamp || event.metadata.creationTimestamp,
          eventType: event.eventType
        };
      });
    },

    eventHeaders() {
      return [
        {
          name:  'reason',
          label: this.t('tableHeaders.reason'),
          value: 'reason',
          sort:  'reason',
        },
        {
          name:  'message',
          label: this.t('tableHeaders.message'),
          value: 'message',
          sort:  'message',
        },
        {
          name:          'date',
          label:         this.t('tableHeaders.updated'),
          value:         'date',
          sort:          'date:desc',
          formatter:     'LiveDate',
          formatterOpts: { addSuffix: true },
          width:         125
        },
      ];
    },

    seederEnabled() {
      const inStore = this.$store.getters['currentProduct'].inStore;
      const addons = this.$store.getters[`${ inStore }/all`](HCI.ADD_ONS);
      const seeder = addons.find((addon) => addon.id === 'harvester-system/harvester-seeder');

      return seeder ? seeder?.spec?.enabled : false;
    },

    ntpSync() {
      const jsonString = this.value.metadata?.annotations?.[HCI_ANNOTATIONS.NODE_NTP_SYNC_STATUS];
      let out = null;

      if (!jsonString) {
        return out;
      }

      try {
        out = JSON.parse(jsonString);
      } catch (err) {
        this.$store.dispatch('growl/fromError', {
          title: this.t('generic.notification.title.error', { name: escapeHtml(this.value.metadata.name) }),
          err,
        }, { root: true });
      }

      return out;
    },

    ntpSyncedStatus() {
      const status = this.ntpSync?.ntpSyncStatus;

      if (status === 'disabled') {
        return {
          status:  'disabled',
          warning: { key: 'harvester.host.ntp.ntpSyncStatus.isDisabled' }
        };
      }

      if (status === 'unsynced') {
        return {
          status:  'unsynced',
          warning: {
            key:     'harvester.host.ntp.ntpSyncStatus.isUnsynced',
            current: this.ntpSync?.currentNtpServers ? `<code>${ this.ntpSync.currentNtpServers }</code>` : '',
          }
        };
      }

      return {};
    },
  },

  methods: {
    async loadMetrics() {
      const schema = this.$store.getters['harvester/schemaFor'](METRIC.NODE);

      if (schema) {
        this.metrics = await this.$store.dispatch('harvester/find', {
          type: METRIC.NODE,
          id:   this.value.id,
          opt:  { force: true, watch: false }
        });

        this.$forceUpdate();
      }
    },

    // Ensures we only fetch events and show the table when the events tab has been activated
    tabChange(neu) {
      if (!this.didLoadEvents && neu?.selectedName === 'events') {
        this.$store.dispatch(`harvester/findAll`, { type: EVENT }).then((events) => {
          this.allEvents = events;
          this.didLoadEvents = true;
        });
      }
    },
  }
};
</script>

<template>
  <Loading v-if="$fetchState.pending" />
  <div v-else>
    <Banner
      v-if="ntpSyncedStatus.status === 'disabled'"
      color="warning"
    >
      <span v-clean-html="t(ntpSyncedStatus.warning.key)"></span>
    </Banner>
    <Banner
      v-if="ntpSyncedStatus.status === 'unsynced'"
      color="warning"
    >
      <span v-clean-html="t(ntpSyncedStatus.warning.key, { current: ntpSyncedStatus.warning.current }, true)"></span>
    </Banner>
    <Tabbed
      v-bind="$attrs"
      class="mt-15"
      :side-tabs="true"
      @changed="tabChange"
    >
      <Tab
        name="basics"
        :label="t('harvester.host.tabs.basics')"
        :weight="4"
        class="bordered-table"
      >
        <Basic
          :value="value"
          :metrics="metrics"
          :mode="mode"
        />
      </Tab>
      <Tab
        name="instance"
        :label="t('harvester.host.tabs.instance')"
        :weight="3"
        class="bordered-table"
      >
        <Instance :node="value" />
      </Tab>
      <Tab
        v-if="hasHostNetworksSchema && vlanStatuses.length > 0"
        name="network"
        :label="t('harvester.host.tabs.network')"
        :weight="2"
        class="bordered-table"
      >
        <InfoBox
          v-for="(vlan, i) in vlanStatuses"
          :key="i"
        >
          <VlanStatus
            :value="vlan"
            :mode="mode"
          />
        </InfoBox>
      </Tab>
      <Tab
        v-if="hasBlockDevicesSchema"
        name="disk"
        :weight="1"
        :label="t('harvester.host.tabs.storage')"
      >
        <div
          v-if="longhornNode"
          class="row mb-20"
        >
          <div class="col span-12">
            <LabelValue
              v-if="longhornNode.spec.tags.length"
              :name="t('harvester.host.tags.label')"
            >
              <template #value>
                <div class="mt-5">
                  <Tag
                    v-for="(prop, key) in longhornNode.spec.tags"
                    :key="key"
                  >
                    {{ prop }}
                  </Tag>
                </div>
              </template>
            </LabelValue>
          </div>
        </div>
        <ArrayListGrouped
          v-model:value="newDisks"
          :mode="mode"
          :can-remove="false"
          :initial-empty-row="false"
        >
          <template #default="props">
            <Disk
              v-model:value="props.row.value"
              class="mb-20"
              :mode="mode"
              :disks="disks"
            />
          </template>
        </ArrayListGrouped>
      </Tab>

      <Tab
        v-if="hasKsmtunedSchema"
        name="ksmtuned"
        :weight="0"
        :show-header="false"
        :label="t('harvester.host.tabs.ksmtuned')"
      >
        <HarvesterKsmtuned
          :mode="mode"
          :node="value"
        />
      </Tab>

      <Tab
        v-if="seederEnabled"
        name="seeder"
        :weight="-1"
        :label="t('harvester.host.tabs.seeder')"
      >
        <HarvesterSeeder
          :mode="mode"
          :node="value"
          :inventory="inventory"
        />
      </Tab>

      <Tab
        label-key="harvester.virtualMachine.detail.tabs.events"
        name="events"
        :weight="-99"
      >
        <SortableTable
          :rows="events"
          :headers="eventHeaders"
          key-field="id"
          :search="false"
          :table-actions="false"
          :row-actions="false"
          default-sort-by="date"
        />
      </Tab>
    </Tabbed>
  </div>
</template>
