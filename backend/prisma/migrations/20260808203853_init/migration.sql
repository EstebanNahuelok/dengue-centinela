-- CreateEnum
CREATE TYPE "TipoReporte" AS ENUM ('sintoma', 'criadero');

-- CreateEnum
CREATE TYPE "ClasificacionIA" AS ENUM ('sospecha_alta', 'sospecha_media', 'no_relevante');

-- CreateTable
CREATE TABLE "reportes" (
    "id" TEXT NOT NULL,
    "telefono_hash" TEXT NOT NULL,
    "tipo" "TipoReporte" NOT NULL,
    "barrio" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "descripcion" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clasificacion_ia" "ClasificacionIA",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reportes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zonas_riesgo" (
    "id" TEXT NOT NULL,
    "barrio" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "score_actual" INTEGER NOT NULL DEFAULT 0,
    "cantidad_reportes_7d" INTEGER NOT NULL DEFAULT 0,
    "factor_clima" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ultima_actualizacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zonas_riesgo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reportes_barrio_idx" ON "reportes"("barrio");

-- CreateIndex
CREATE INDEX "reportes_timestamp_idx" ON "reportes"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "zonas_riesgo_barrio_key" ON "zonas_riesgo"("barrio");
