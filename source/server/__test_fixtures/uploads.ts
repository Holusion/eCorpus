import request from "supertest";

export interface SendUploadOptions {
  /** Files of the upload, by path relative to its root */
  files: Record<string, Buffer>;
  /** Entry point of the upload. Defaults to the first file */
  main?: string;
  /** Target scene of the upload */
  scene?: string | null;
  /** `Accept-Language` of the processing request */
  lang?: string;
}

/**
 * Create an upload, send each of its files in one go, then process it.
 * Each step is expected to succeed, except processing: its response is returned as-is.
 * @param authorization value of the requests' `Authorization` header
 */
export async function sendUpload(server: any, authorization: string, { files, main = Object.keys(files)[0], scene, lang }: SendUploadOptions) {
  const { body: { task_id } } = await request(server).post("/uploads")
    .set("Authorization", authorization)
    .send(typeof scene === "undefined" ? {} : { scene })
    .expect(201);
  for (const [filepath, data] of Object.entries(files)) {
    await request(server).put(`/uploads/${task_id}/files/${filepath.split("/").map(encodeURIComponent).join("/")}`)
      .set("Authorization", authorization)
      .send(data)
      .expect(201);
  }
  const req = request(server).post(`/uploads/${task_id}/process`)
    .set("Authorization", authorization);
  if (lang) req.set("Accept-Language", lang);
  const res = await req.send({ main });
  return { task_id: task_id as number, res };
}
