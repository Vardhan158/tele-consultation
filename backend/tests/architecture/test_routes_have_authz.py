"""Fail the build if any route is reachable without Depends(require(...)).

We inspect each module's router directly (stable across FastAPI versions) plus any routes
declared straight on the app. Newer FastAPI versions wrap included routers privately, so
iterating app.routes alone would silently skip them.
"""
import importlib
import pkgutil

from fastapi import APIRouter, Depends, FastAPI
from fastapi.dependencies.models import Dependant
from fastapi.routing import APIRoute

import teleconsult.modules as modules_pkg
from teleconsult.kernel.authz import get_principal, require
from teleconsult.main import PUBLIC_PATHS, app


def _has_authz(dep: Dependant) -> bool:
    if getattr(dep.call, "_is_authz", False):
        return True
    return any(_has_authz(d) for d in dep.dependencies)


def _module_routers() -> dict[str, APIRouter]:
    found: dict[str, APIRouter] = {}
    for info in pkgutil.iter_modules(modules_pkg.__path__):
        mod = importlib.import_module(f"teleconsult.modules.{info.name}.routes")
        found[info.name] = mod.router
    return found


def _offenders(routes: list[object], skip_public: bool) -> list[str]:
    return [
        f"{sorted(r.methods)} {r.path}"
        for r in routes
        if isinstance(r, APIRoute)
        and not (skip_public and r.path in PUBLIC_PATHS)
        and not _has_authz(r.dependant)
    ]


def test_every_module_route_requires_authorization() -> None:
    routers = _module_routers()
    assert routers, "No module routers discovered; the test would pass vacuously"
    offenders: list[str] = []
    for name, router in routers.items():
        offenders += [f"{name}: {o}" for o in _offenders(list(router.routes), skip_public=False)]
    assert not offenders, f"Routes missing Depends(require(...)): {offenders}"


def test_top_level_routes_are_explicitly_public_or_protected() -> None:
    assert not _offenders(list(app.routes), skip_public=True)


def test_detector_distinguishes_protected_from_unprotected() -> None:
    """Self-check: proves the detector can actually fail."""
    probe = FastAPI()

    @probe.get("/open")
    async def open_route() -> dict[str, str]:
        return {}

    @probe.get("/closed", dependencies=[Depends(require("x.read"))])
    async def closed_route() -> dict[str, str]:
        return {}

    assert _offenders(list(probe.routes), skip_public=False) == ["['GET', 'HEAD'] /open"] or \
        _offenders(list(probe.routes), skip_public=False) == ["['GET'] /open"]
    assert get_principal is not None
