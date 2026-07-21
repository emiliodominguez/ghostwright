import { startTelemetry } from '@ghostwright/otel';

// Imported first in index.ts so telemetry is up before the worker/run modules load.
startTelemetry('worker');
