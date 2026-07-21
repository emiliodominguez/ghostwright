import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const OTLP_BASE = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';

/**
 * Start OpenTelemetry (traces + metrics) for a service. Call BEFORE importing app
 * code so auto-instrumentation can patch the modules it depends on.
 *
 * @param serviceName - logical service name reported as `service.name`.
 * @returns the started NodeSDK.
 */
export function startTelemetry(serviceName: string): NodeSDK {
	const sdk = new NodeSDK({
		resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName }),
		traceExporter: new OTLPTraceExporter({ url: `${OTLP_BASE}/v1/traces` }),
		metricReader: new PeriodicExportingMetricReader({
			exporter: new OTLPMetricExporter({ url: `${OTLP_BASE}/v1/metrics` }),
			exportIntervalMillis: 5000,
		}),
		instrumentations: [getNodeAutoInstrumentations()],
	});

	sdk.start();
	process.on('SIGTERM', () => {
		void sdk.shutdown();
	});

	return sdk;
}
