
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.ts";
const sql = neon(
 "postgresql://zero2hero_owner:z1psn5xfvULS@ep-raspy-snowflake-a5spcxhg.us-east-2.aws.neon.tech/zero2hero?sslmode=require"
);
export const db = drizzle(sql, { schema });