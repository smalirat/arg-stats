import json
from supabase import create_client
import dotenv

SUPABASE_URL = dotenv.get_key("SUPABASE_URL")
SUPABASE_KEY = dotenv.get_key("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def migrar_equipos(ruta_json):
    # 1. Leemos tu JSON local
    with open(ruta_json, 'r', encoding='utf-8') as f:
        datos = json.load(f)
    
    # Supongamos que tu JSON es una lista de diccionarios.
    # Tenemos que mapear las llaves de tu JSON a las columnas exactas de tu tabla SQL.
    payload = []
    for equipo in datos:
        payload.append({
            "equipo_id": equipo["id"],
            "nombre_fuente": equipo["name"],
            "nombre_corto": equipo.get("shortName", "")
        })
    
    # 2. Subida masiva a Supabase
    # upsert evita errores si corrés el script dos veces (actualiza en lugar de duplicar)
    respuesta = supabase.table("equipos").upsert(payload).execute()
    print(f"✅ Se migraron {len(respuesta.data)} equipos exitosamente.")

if __name__ == "__main__":
    migrar_equipos("ruta/a/tus/equipos.json")