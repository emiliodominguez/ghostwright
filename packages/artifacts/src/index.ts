import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { CopyObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const endpoint = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
// Presigned URLs are handed to the browser, so they must use a browser-reachable host.
const publicEndpoint = process.env.S3_PUBLIC_ENDPOINT ?? endpoint;

const credentials = {
	accessKeyId: process.env.S3_ACCESS_KEY ?? 'minioadmin',
	secretAccessKey: process.env.S3_SECRET_KEY ?? 'minioadmin',
};
const region = process.env.S3_REGION ?? 'us-east-1';

/** Internal client — used for uploads from the worker. */
const s3 = new S3Client({ endpoint, region, forcePathStyle: true, credentials });
/** Signing client bound to the public endpoint so presigned URLs resolve in the browser. */
const presignClient = new S3Client({ endpoint: publicEndpoint, region, forcePathStyle: true, credentials });

export const bucket = process.env.S3_BUCKET ?? 'artifacts';

/**
 * Upload an in-memory buffer (screenshots, diff images) to the artifact store.
 *
 * @param key - object key, e.g. `runs/<id>/screenshot.png`.
 * @param body - the bytes.
 * @param contentType - MIME type.
 * @returns the stored key.
 */
export async function putObject(key: string, body: Buffer | Uint8Array | string, contentType: string): Promise<string> {
	await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
	return key;
}

/**
 * Stream a file from disk to the artifact store via managed multipart upload — for
 * large artifacts of unknown length (trace.zip, video, HAR).
 *
 * @param key - object key.
 * @param filePath - local path to stream from.
 * @param contentType - MIME type.
 * @returns the stored key.
 */
export async function uploadFile(key: string, filePath: string, contentType: string): Promise<string> {
	await new Upload({
		client: s3,
		params: { Bucket: bucket, Key: key, Body: createReadStream(filePath), ContentType: contentType },
	}).done();
	return key;
}

/**
 * Server-side copy of one object to another key (used to promote an actual image
 * to a baseline on approve).
 *
 * @param srcKey - source object key.
 * @param destKey - destination object key.
 */
export async function copyObject(srcKey: string, destKey: string): Promise<void> {
	await s3.send(new CopyObjectCommand({ Bucket: bucket, Key: destKey, CopySource: `${bucket}/${srcKey}` }));
}

/**
 * Download an object to a local file — used by the worker to feed odiff (which
 * diffs files on disk).
 *
 * @param key - object key.
 * @param filePath - destination path.
 */
export async function downloadToFile(key: string, filePath: string): Promise<void> {
	const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
	await pipeline(res.Body as Readable, createWriteStream(filePath));
}

export interface ArtifactStream {
	body: ReadableStream;
	contentType?: string;
	contentLength?: number;
	/** Set when a byte range was requested — the `bytes start-end/total` response header. */
	contentRange?: string;
}

/**
 * Fetch an object as a web stream — used by the app to proxy artifacts same-origin
 * (so the trace viewer and the trace.zip share an origin and skip CORS). Pass a
 * `Range` header value to fetch a byte range (enables video seeking).
 *
 * @param key - object key.
 * @param range - optional HTTP `Range` header value (e.g. `bytes=0-1023`).
 * @returns the object's web stream plus content metadata.
 */
export async function getObject(key: string, range?: string): Promise<ArtifactStream> {
	const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: range }));
	return {
		body: (res.Body as { transformToWebStream(): ReadableStream }).transformToWebStream(),
		contentType: res.ContentType,
		contentLength: res.ContentLength,
		contentRange: res.ContentRange,
	};
}

/**
 * Generate a short-lived presigned GET URL for a stored object.
 *
 * @param key - object key.
 * @param expiresIn - lifetime in seconds (default 3600).
 * @returns a presigned URL reachable by the browser.
 */
export async function presignGet(key: string, expiresIn = 3600): Promise<string> {
	return getSignedUrl(presignClient, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
}
