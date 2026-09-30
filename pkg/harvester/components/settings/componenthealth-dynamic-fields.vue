<script>
import { _EDIT } from '@shell/config/query-params';
import InfoBox from '@shell/components/InfoBox';
import LabeledSelect from '@shell/components/form/LabeledSelect';
import { LabeledInput } from '@components/Form/LabeledInput';

const SEVERITIES = ['Error', 'Warning', 'Info'];

function emptyField() {
  return {
    name:                '',
    componentHealthName: '',
    resource:            {
      apiVersion: '',
      kind:       '',
    },
    fieldPath:  '',
    matchValue: '',
    severity:   'Warning',
    message:    '',
  };
}

function stripYamlQuotes(value = '') {
  const trimmed = value.trim();
  const quote = trimmed[0];

  if ((quote === '"' || quote === "'") && trimmed[trimmed.length - 1] === quote) {
    const unquoted = trimmed.slice(1, -1);

    return quote === '"' ? unquoted.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\') : unquoted.replace(/''/g, "'");
  }

  return trimmed;
}

function parseYamlLine(line) {
  const index = line.indexOf(':');

  if (index === -1) {
    return null;
  }

  return {
    key:   line.slice(0, index).trim(),
    value: stripYamlQuotes(line.slice(index + 1)),
  };
}

function normalizeField(field) {
  return {
    ...emptyField(),
    ...field,
    resource: {
      ...emptyField().resource,
      ...(field.resource || {}),
    },
  };
}

function parseFields(value = '') {
  const fields = [];
  let field = null;
  let context = '';

  value.split('\n').forEach((line) => {
    if (!line.trim() || line.trim().startsWith('#')) {
      return;
    }

    if (line.startsWith('- ')) {
      if (field) {
        fields.push(normalizeField(field));
      }

      field = emptyField();
      context = '';

      const parsed = parseYamlLine(line.slice(2));

      if (parsed) {
        field[parsed.key] = parsed.value;
      }

      return;
    }

    if (!field) {
      return;
    }

    const indent = line.match(/^ */)[0].length;
    const trimmed = line.trim();

    if (indent === 2 && trimmed === 'resource:') {
      context = 'resource';

      return;
    }

    const parsed = parseYamlLine(trimmed);

    if (!parsed) {
      return;
    }

    if (context === 'resource' && indent >= 4) {
      field.resource[parsed.key] = parsed.value;
    } else if (indent === 2) {
      context = '';
      field[parsed.key] = parsed.value;
    }
  });

  if (field) {
    fields.push(normalizeField(field));
  }

  return fields;
}

function yamlValue(value, alwaysQuote = false) {
  const str = `${ value ?? '' }`;
  const needsQuotes = alwaysQuote || !str || /^\s|\s$/.test(str) || /[:#"'{}[\],&*?|<>=!%@`]/.test(str) || /^(true|false|null|~|-?\d)/i.test(str);

  if (!needsQuotes) {
    return str;
  }

  return `"${ str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') }"`;
}

function serializeFields(fields = []) {
  return fields.map((field) => [
    `- name: ${ yamlValue(field.name) }`,
    `  componentHealthName: ${ yamlValue(field.componentHealthName) }`,
    '  resource:',
    `    apiVersion: ${ yamlValue(field.resource?.apiVersion) }`,
    `    kind: ${ yamlValue(field.resource?.kind) }`,
    `  fieldPath: ${ yamlValue(field.fieldPath) }`,
    `  matchValue: ${ yamlValue(field.matchValue, true) }`,
    `  severity: ${ yamlValue(field.severity) }`,
    `  message: ${ yamlValue(field.message, true) }`,
  ].join('\n')).join('\n');
}

export default {
  name: 'HarvesterComponentHealthDynamicFields',

  components: {
    InfoBox,
    LabeledInput,
    LabeledSelect,
  },

  props: {
    registerBeforeHook: {
      type:     Function,
      required: true,
    },

    mode: {
      type:    String,
      default: _EDIT,
    },

    value: {
      type:    Object,
      default: () => {
        return {};
      },
    },
  },

  data() {
    const rawValue = this.value.value || this.value.default || '';

    return { fields: parseFields(rawValue) };
  },

  created() {
    this.update();

    if (this.registerBeforeHook) {
      this.registerBeforeHook(this.willSave, 'willSave');
    }
  },

  computed: {
    severityOptions() {
      return SEVERITIES.map((severity) => ({
        label: severity,
        value: severity,
      }));
    },
  },

  methods: {
    add() {
      this.fields.push(emptyField());
      this.update();
    },

    remove(index) {
      this.fields.splice(index, 1);
      this.update();
    },

    update() {
      this.value.value = serializeFields(this.fields);
    },

    useDefault() {
      this.fields = parseFields(this.value.default || '');
      this.update();
    },

    willSave() {
      this.update();

      const errors = [];

      this.fields.forEach((field, index) => {
        const row = index + 1;
        const requiredFields = [
          ['name', this.t('harvester.setting.componentHealthDynamicFields.name')],
          ['componentHealthName', this.t('harvester.setting.componentHealthDynamicFields.componentHealthName')],
          ['resource.apiVersion', this.t('harvester.setting.componentHealthDynamicFields.apiVersion')],
          ['resource.kind', this.t('harvester.setting.componentHealthDynamicFields.kind')],
          ['fieldPath', this.t('harvester.setting.componentHealthDynamicFields.fieldPath')],
          ['matchValue', this.t('harvester.setting.componentHealthDynamicFields.matchValue')],
          ['severity', this.t('harvester.setting.componentHealthDynamicFields.severity')],
          ['message', this.t('harvester.setting.componentHealthDynamicFields.message')],
        ];

        requiredFields.forEach(([path, label]) => {
          const value = path.split('.').reduce((obj, key) => obj?.[key], field);

          if (!value) {
            errors.push(this.t('harvester.setting.componentHealthDynamicFields.required', { row, field: label }, true));
          }
        });

        if (field.severity && !SEVERITIES.includes(field.severity)) {
          errors.push(this.t('harvester.setting.componentHealthDynamicFields.invalidSeverity', { row }, true));
        }
      });

      if (errors.length > 0) {
        return Promise.reject(errors);
      }

      return Promise.resolve();
    },
  },

  watch: {
    'value.value'(value) {
      if (value !== serializeFields(this.fields)) {
        this.fields = parseFields(value || this.value.default || '');
      }
    },
  },
};
</script>

<template>
  <div>
    <InfoBox
      v-for="(field, index) in fields"
      :key="index"
      class="box"
    >
      <button
        type="button"
        class="role-link btn btn-sm remove"
        @click="remove(index)"
      >
        <i class="icon icon-x" />
      </button>

      <div class="row">
        <div class="col span-6">
          <LabeledInput
            v-model:value="field.name"
            class="mb-20"
            :mode="mode"
            required
            label-key="harvester.setting.componentHealthDynamicFields.name"
            @update:value="update"
          />
        </div>
        <div class="col span-6">
          <LabeledInput
            v-model:value="field.componentHealthName"
            class="mb-20"
            :mode="mode"
            required
            label-key="harvester.setting.componentHealthDynamicFields.componentHealthName"
            @update:value="update"
          />
        </div>
      </div>

      <div class="row">
        <div class="col span-6">
          <LabeledInput
            v-model:value="field.resource.apiVersion"
            class="mb-20"
            :mode="mode"
            required
            label-key="harvester.setting.componentHealthDynamicFields.apiVersion"
            @update:value="update"
          />
        </div>
        <div class="col span-6">
          <LabeledInput
            v-model:value="field.resource.kind"
            class="mb-20"
            :mode="mode"
            required
            label-key="harvester.setting.componentHealthDynamicFields.kind"
            @update:value="update"
          />
        </div>
      </div>

      <div class="row">
        <div class="col span-6">
          <LabeledInput
            v-model:value="field.fieldPath"
            class="mb-20"
            :mode="mode"
            required
            label-key="harvester.setting.componentHealthDynamicFields.fieldPath"
            @update:value="update"
          />
        </div>
        <div class="col span-6">
          <LabeledInput
            v-model:value="field.matchValue"
            class="mb-20"
            :mode="mode"
            required
            label-key="harvester.setting.componentHealthDynamicFields.matchValue"
            @update:value="update"
          />
        </div>
      </div>

      <div class="row">
        <div class="col span-4">
          <LabeledSelect
            v-model:value="field.severity"
            class="mb-20"
            :mode="mode"
            required
            label-key="harvester.setting.componentHealthDynamicFields.severity"
            :options="severityOptions"
            @update:value="update"
          />
        </div>
        <div class="col span-8">
          <LabeledInput
            v-model:value="field.message"
            class="mb-20"
            :mode="mode"
            required
            label-key="harvester.setting.componentHealthDynamicFields.message"
            @update:value="update"
          />
        </div>
      </div>
    </InfoBox>

    <button
      type="button"
      class="btn btn-sm role-primary"
      @click="add"
    >
      {{ t('harvester.setting.componentHealthDynamicFields.add') }}
    </button>
  </div>
</template>

<style lang="scss" scoped>
.box {
  position: relative;
  padding-top: 40px;
}

.remove {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 0px;
}
</style>
