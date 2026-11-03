"""
Crea la VM gratis de ArgStats en Oracle Cloud con el SDK de Python (pip install oci).

Intenta una VM.Standard.A1.Flex (ARM, por defecto 2 OCPU / 12 GB, la mitad del
cupo gratis), y como suele no haber lugar ("Out of capacity") reintenta cada
algunos minutos. Con --micro-despues N, si después de N rondas sigue sin lugar,
crea una VM.Standard.E2.1.Micro (1 GB, casi siempre disponible).

Red: reusa la VCN de la cuenta que ya tiene salida a internet y le agrega una
subred propia ("argstats-public") con su security list (22, 80, 443). Así no
toca las reglas de los otros proyectos de la cuenta.

Auth: ~/.oci/config (el mismo archivo que la CLI de OCI).
Llave SSH: ~/.ssh/oracle_argstats(.pub); si no existe, la crea con ssh-keygen.

    python deploy/oci_crear_vm.py                       # A1 2 OCPU / 12 GB, cada 2 minutos
    python deploy/oci_crear_vm.py --micro-despues 5     # A1; si en 5 rondas no hay lugar, la micro
    python deploy/oci_crear_vm.py --micro               # directo la micro
"""
import argparse
import ipaddress
import os
import subprocess
import time
from datetime import datetime

import oci

A1, MICRO = "VM.Standard.A1.Flex", "VM.Standard.E2.1.Micro"
NOMBRE = "argstats"
SUBRED, SECURITY_LIST = "argstats-public", "argstats-sl"
LLAVE = os.path.expanduser("~/.ssh/oracle_argstats")


def log(msg):
    print(f"{datetime.now():%H:%M:%S} {msg}", flush=True)


def llave_ssh():
    if not os.path.exists(LLAVE + ".pub"):
        log(f"creando llave SSH {LLAVE}")
        os.makedirs(os.path.dirname(LLAVE), exist_ok=True)
        subprocess.run(["ssh-keygen", "-t", "rsa", "-b", "4096", "-N", "", "-C", "argstats-oracle", "-f", LLAVE], check=True)
    with open(LLAVE + ".pub") as f:
        return f.read().strip()


def vcn_con_internet(net, comp):
    """Una VCN cuya tabla de rutas por defecto sale a internet (0.0.0.0/0)."""
    for vcn in net.list_vcns(comp).data:
        if vcn.lifecycle_state != "AVAILABLE":
            continue
        rutas = net.get_route_table(vcn.default_route_table_id).data.route_rules
        if any(r.destination == "0.0.0.0/0" for r in rutas):
            return vcn
    raise SystemExit("No hay una VCN con salida a internet. Creá una desde la consola (asistente 'VCN with Internet Connectivity').")


def asegurar_subred(net, comp):
    for vcn in net.list_vcns(comp).data:
        existentes = [s for s in net.list_subnets(comp, vcn_id=vcn.id, display_name=SUBRED).data if s.lifecycle_state == "AVAILABLE"]
        if existentes:
            log(f"reuso la subred {SUBRED} de la VCN {vcn.display_name}")
            return existentes[0]

    vcn = vcn_con_internet(net, comp)
    m = oci.core.models
    tcp = lambda puerto: m.IngressSecurityRule(
        protocol="6", source="0.0.0.0/0", tcp_options=m.TcpOptions(destination_port_range=m.PortRange(min=puerto, max=puerto)))
    log(f"creando security list {SECURITY_LIST} (22, 80, 443) en la VCN {vcn.display_name}")
    sl = net.create_security_list(m.CreateSecurityListDetails(
        compartment_id=comp, vcn_id=vcn.id, display_name=SECURITY_LIST,
        ingress_security_rules=[
            tcp(22), tcp(80), tcp(443),
            # ICMP "fragmentation needed": sin esto se cortan algunas conexiones (path MTU)
            m.IngressSecurityRule(protocol="1", source="0.0.0.0/0", icmp_options=m.IcmpOptions(type=3, code=4)),
        ],
        egress_security_rules=[m.EgressSecurityRule(protocol="all", destination="0.0.0.0/0")])).data
    oci.wait_until(net, net.get_security_list(sl.id), "lifecycle_state", "AVAILABLE")

    # Un /24 libre dentro de la VCN
    usados = [ipaddress.ip_network(s.cidr_block) for s in net.list_subnets(comp, vcn_id=vcn.id).data]
    bloque = next(n for c in vcn.cidr_blocks for n in ipaddress.ip_network(c).subnets(new_prefix=24)
                  if not any(n.overlaps(u) for u in usados))
    log(f"creando subred {SUBRED} {bloque}")
    subred = net.create_subnet(m.CreateSubnetDetails(
        compartment_id=comp, vcn_id=vcn.id, display_name=SUBRED, cidr_block=str(bloque), dns_label="argstats",
        route_table_id=vcn.default_route_table_id, security_list_ids=[sl.id], prohibit_public_ip_on_vnic=False)).data
    return oci.wait_until(net, net.get_subnet(subred.id), "lifecycle_state", "AVAILABLE").data


def imagen_ubuntu(compute, comp, shape):
    imagenes = compute.list_images(comp, operating_system="Canonical Ubuntu", operating_system_version="24.04",
                                   shape=shape, sort_by="TIMECREATED", sort_order="DESC").data
    if not imagenes:
        raise SystemExit(f"No hay imagen de Ubuntu 24.04 para {shape}")
    return imagenes[0]


def crear(compute, comp, ad, shape, subred, imagen, llave, ocpus, memoria):
    m = oci.core.models
    return compute.launch_instance(m.LaunchInstanceDetails(
        compartment_id=comp, availability_domain=ad, display_name=NOMBRE, shape=shape,
        # Las Flex llevan su tamaño; la micro tiene uno fijo
        shape_config=m.LaunchInstanceShapeConfigDetails(ocpus=ocpus, memory_in_gbs=memoria) if shape == A1 else None,
        source_details=m.InstanceSourceViaImageDetails(image_id=imagen.id),
        create_vnic_details=m.CreateVnicDetails(subnet_id=subred.id, assign_public_ip=True, display_name=f"{NOMBRE}-vnic"),
        metadata={"ssh_authorized_keys": llave})).data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ocpus", type=float, default=2)
    ap.add_argument("--memoria", type=float, default=12, help="GB")
    ap.add_argument("--cada", type=int, default=120, help="segundos entre rondas")
    ap.add_argument("--micro", action="store_true", help="directo la VM.Standard.E2.1.Micro")
    ap.add_argument("--micro-despues", type=int, default=0, help="rondas de A1 sin lugar antes de pasar a la micro (0: nunca)")
    args = ap.parse_args()

    config = oci.config.from_file()
    comp = config["tenancy"]  # compartment raíz
    identity = oci.identity.IdentityClient(config)
    compute = oci.core.ComputeClient(config)
    net = oci.core.VirtualNetworkClient(config)

    existentes = [i for i in compute.list_instances(comp, display_name=NOMBRE).data
                  if i.lifecycle_state not in ("TERMINATED", "TERMINATING")]
    if existentes:
        raise SystemExit(f'Ya hay una VM "{NOMBRE}" ({existentes[0].lifecycle_state}): no creo otra')

    ads = [ad.name for ad in identity.list_availability_domains(comp).data]
    subred = asegurar_subred(net, comp)
    llave = llave_ssh()
    shape = MICRO if args.micro else A1
    imagen = imagen_ubuntu(compute, comp, shape)
    log(f"{shape}, imagen {imagen.display_name}, ADs: {', '.join(ads)}")

    ronda = 0
    instancia = None
    while instancia is None:
        ronda += 1
        for ad in ads:
            try:
                instancia = crear(compute, comp, ad, shape, subred, imagen, llave, args.ocpus, args.memoria)
                log(f"ronda {ronda} {ad}: creada, esperando a que arranque...")
                break
            except oci.exceptions.ServiceError as e:
                if "capacity" in e.message.lower():
                    log(f"ronda {ronda} {ad}: sin lugar para {shape}")
                elif e.status == 429:
                    log(f"ronda {ronda} {ad}: demasiados pedidos, espero")
                    time.sleep(30)
                else:
                    raise
        if instancia is None:
            if shape == A1 and args.micro_despues and ronda >= args.micro_despues:
                log(f"sin lugar para A1 tras {ronda} rondas: paso a {MICRO}")
                shape = MICRO
                imagen = imagen_ubuntu(compute, comp, shape)
                continue
            time.sleep(args.cada)

    oci.wait_until(compute, compute.get_instance(instancia.id), "lifecycle_state", "RUNNING", max_wait_seconds=900)
    vnic_id = compute.list_vnic_attachments(comp, instance_id=instancia.id).data[0].vnic_id
    ip = net.get_vnic(vnic_id).data.public_ip
    log(f"CORRIENDO ({shape}). IP pública: {ip}")
    log(f"   ssh -i {LLAVE} ubuntu@{ip}")
    log(f"   dominio sin costo: {ip.replace('.', '-')}.sslip.io")


if __name__ == "__main__":
    main()
