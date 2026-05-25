import { createClient } from "@supabase/supabase-js";
import { appConfig, requireBrowserEnv } from "../config/env";

requireBrowserEnv();

export const supabase = createClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey);
