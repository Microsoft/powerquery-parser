// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Ast } from "../../../language";
import { NodeIdMapUtils, TXorNode, XorNodeUtils } from "../../../parser";
import { Type } from "../../../type";
import { inspectXorNode, TypeInspectionState } from "./common";
import { examineFieldSpecificationList } from "./examineFieldSpecificationList";

export function inspectTableType(
    state: TypeInspectionState,
    xorNode: TXorNode,
): Type.DefinedType<Type.DefinedTable | Type.PrimaryExpressionTable> | Type.Unknown {
    XorNodeUtils.assertAstNodeKind(xorNode, Ast.NodeKind.TableType);

    const maybeRowType: TXorNode | undefined = NodeIdMapUtils.maybeXorChildByAttributeIndex(
        state.nodeIdMapCollection,
        xorNode.node.id,
        1,
        undefined,
    );
    if (maybeRowType === undefined) {
        return Type.UnknownInstance;
    }

    if (maybeRowType.node.kind === Ast.NodeKind.FieldSpecificationList) {
        return {
            kind: Type.TypeKind.Type,
            maybeExtendedKind: Type.ExtendedTypeKind.DefinedType,
            isNullable: false,
            primaryType: {
                kind: Type.TypeKind.Table,
                maybeExtendedKind: Type.ExtendedTypeKind.DefinedTable,
                isNullable: false,
                ...examineFieldSpecificationList(state, maybeRowType),
            },
        };
    } else {
        return {
            kind: Type.TypeKind.Type,
            maybeExtendedKind: Type.ExtendedTypeKind.DefinedType,
            isNullable: false,
            primaryType: {
                kind: Type.TypeKind.Table,
                maybeExtendedKind: Type.ExtendedTypeKind.PrimaryExpressionTable,
                isNullable: false,
                type: inspectXorNode(state, maybeRowType),
            },
        };
    }
}