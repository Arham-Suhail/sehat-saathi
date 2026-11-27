"""Can this email's domain receive mail at all? Checked BEFORE any code is emailed, so made-up domains
(e.g. "x@qwerty-not-real.xyz") never cause a bounce that would hurt our sender reputation.

Accept when the domain has an MX record, or (RFC 5321 fallback) no MX but an A/AAAA record.
Reject when the domain doesn't exist or publishes a "null MX" (= accepts no mail).
On DNS trouble (timeout, server failure) we ACCEPT: an outage must never block a real sign-up.
"""

import logging

import dns.asyncresolver
import dns.exception
import dns.resolver

log = logging.getLogger(__name__)
TIMEOUT = 3.0


async def domain_accepts_mail(email: str) -> bool:
    domain = email.rsplit("@", 1)[-1].strip().lower().rstrip(".")
    if not domain or "." not in domain:
        return False
    resolver = dns.asyncresolver.Resolver()
    resolver.lifetime = TIMEOUT
    try:
        answer = await resolver.resolve(domain, "MX")
        hosts = [str(r.exchange).rstrip(".") for r in answer]
        return any(hosts)  # a lone "." exchange is a null MX: the domain takes no mail
    except dns.resolver.NXDOMAIN:
        return False
    except dns.resolver.NoAnswer:
        pass  # no MX: fall back to an address record
    except (dns.exception.Timeout, dns.resolver.NoNameservers) as e:
        log.warning("mx lookup inconclusive: %s", type(e).__name__)
        return True
    for rtype in ("A", "AAAA"):
        try:
            await resolver.resolve(domain, rtype)
            return True
        except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN):
            continue
        except (dns.exception.Timeout, dns.resolver.NoNameservers):
            return True
    return False
