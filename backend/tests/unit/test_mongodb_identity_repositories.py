from teleconsult.kernel.authz.mongodb_policy import (
    MongoPrincipal,
    require_permission,
    require_same_tenant,
    require_self,
)


def test_mongodb_roles_are_explicit_and_least_privilege() -> None:
    patient = MongoPrincipal("patient-1", "tenant-1", "patient")
    require_permission(patient, "patient:read:self")
    try:
        require_permission(patient, "clinic:doctor:approve")
    except PermissionError:
        pass
    else:
        raise AssertionError("patient received clinic-admin permission")


def test_mongodb_scope_guards_reject_cross_tenant_and_cross_subject_access() -> None:
    principal = MongoPrincipal("user-1", "tenant-1", "doctor")
    require_same_tenant(principal, "tenant-1")
    require_self(principal, "user-1")
    for guard, value in ((require_same_tenant, "tenant-2"), (require_self, "user-2")):
        try:
            guard(principal, value)
        except PermissionError:
            pass
        else:
            raise AssertionError("scope guard allowed unauthorized access")
