<script>
import Collapse from '@shell/components/Collapse';
import PercentageBar from '@shell/components/PercentageBar';

export default {
  name:       'HarvesterUpgradeProgressList',
  components: { PercentageBar, Collapse },

  props: {
    title: {
      type:    String,
      default: ''
    },

    percent: {
      type:    Number,
      default: 0
    },

    list: {
      type:    Array,
      default: () => {
        return [];
      }
    }
  },

  data() {
    return { open: true };
  },

  methods: {
    handleSwitch() {
      this.open = !this.open;
    }
  }
};
</script>

<template>
  <div class="bar-list">
    <h4>{{ title }} <span class="float-r text-info">{{ percent }}%</span></h4>
    <div>
      <div>
        <Collapse v-model:open="open">
          <template #title>
            <div class="total-bar">
              <span class="bar">
                <PercentageBar
                  :model-value="percent"
                  preferred-direction="MORE"
                />
              </span>
              <span
                class="on-off"
                @click="handleSwitch"
              > {{ open ? t('harvester.generic.close') : t('harvester.generic.open') }}</span>
            </div>
          </template>

          <div class="custom-content">
            <div
              v-for="(item, i) in list"
              :key="i"
            >
              <p>
                {{ item.name }} <span
                  class="status"
                  :class="{ [item.state]: true }"
                >{{ item.state }}</span>
              </p>
              <PercentageBar
                :model-value="item.percent"
                preferred-direction="MORE"
              />
              <p class="warning">
                {{ item.message }}
              </p>
            </div>
          </div>
        </Collapse>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.bar-list {
  .float-r {
    float: right;
  }

  .total-bar {
    display: flex;
    user-select: none;
    > .bar {
      width: 85%;
    }
    .on-off {
      margin-left: 10px;
      cursor: pointer;
    }
  }
  .custom-content {
    margin-bottom: 14px;
    p {
      margin-bottom: 4px;
    }
    .status {
      float: right;
    }
    .Succeeded, .Upgrading, .Pending {
      color: var(--success);
    }
    .failed {
      color: var(--error)
    }
    .warning {
      color: var(--error);
    }
  }
}
</style>
