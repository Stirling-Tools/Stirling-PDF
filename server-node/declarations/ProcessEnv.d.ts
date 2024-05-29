declare namespace NodeJS {
    export interface ProcessEnv {
        JOBS_ENABLED: "True" | "False",
        JOBS_DIR: string,
        AUTH_ENABLED: "True" | "False",
        AUTH_SESSION_SECRET: string,
        SEQUELIZE_LOGGING:  "True" | "False"
    }
}