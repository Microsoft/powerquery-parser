import { CommonError } from ".";

export function removeFirstInstance<T>(collection: ReadonlyArray<T>, element: T): T[] {
    return removeAtIndex(collection, collection.indexOf(element));
}

export function removeAtIndex<T>(collection: ReadonlyArray<T>, index: number): T[] {
    if (index < 0 || index >= collection.length) {
        const details: {} = {
            index,
            collectionLength: collection.length,
        };
        throw new CommonError.InvariantError(`index not within array bounds`, details);
    }

    return [...collection.slice(0, index), ...collection.slice(index + 1)];
}

export function findReverse<T>(collection: ReadonlyArray<T>, predicate: (t: T) => boolean): T | undefined {
    const numElements: number = collection.length;

    for (let index: number = numElements - 1; index >= 0; index -= 1) {
        const element: T = collection[index];

        if (predicate(element)) {
            return element;
        }
    }

    return undefined;
}

export function isSubset<T>(
    largerCollection: ReadonlyArray<T>,
    smallerCollection: ReadonlyArray<T>,
    valueCmpFn: (left: T, right: T) => boolean,
): boolean {
    if (smallerCollection.length > largerCollection.length) {
        return false;
    }

    for (const smallerCollectionValue of smallerCollection) {
        let foundMatch: boolean = false;
        for (const largerCollectionValue of largerCollection) {
            if (valueCmpFn(smallerCollectionValue, largerCollectionValue)) {
                foundMatch = true;
                break;
            }
        }

        if (foundMatch === false) {
            return false;
        }
    }

    return true;
}
