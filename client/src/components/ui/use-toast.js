import * as React from "react";
const TOAST_LIMIT = 5;
const TOAST_REMOVE_DELAY = 5000;
const actionTypes = {
    ADD_TOAST: "ADD_TOAST",
    UPDATE_TOAST: "UPDATE_TOAST",
    DISMISS_TOAST: "DISMISS_TOAST",
    REMOVE_TOAST: "REMOVE_TOAST",
};
let count = 0;
function genId() {
    count = (count + 1) % Number.MAX_VALUE;
    return count.toString();
}
const toastTimeouts = new Map();
const reducer = (state, action) => {
    switch (action.type) {
        case actionTypes.ADD_TOAST:
            return {
                ...state,
                toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
            };
        case actionTypes.UPDATE_TOAST:
            return {
                ...state,
                toasts: state.toasts.map((t) => t.id === action.toast.id ? { ...t, ...action.toast } : t),
            };
        case actionTypes.DISMISS_TOAST: {
            const { toastId } = action;
            if (toastId) {
                toastTimeouts.forEach((_, id) => {
                    if (id === toastId) {
                        toastTimeouts.delete(id);
                    }
                });
                return {
                    ...state,
                    toasts: state.toasts.map((t) => t.id === toastId
                        ? {
                            ...t,
                            open: false,
                        }
                        : t),
                };
            }
            return {
                ...state,
                toasts: state.toasts.map((t) => ({
                    ...t,
                    open: false,
                })),
            };
        }
        case actionTypes.REMOVE_TOAST:
            if (action.toastId === undefined) {
                return {
                    ...state,
                    toasts: [],
                };
            }
            return {
                ...state,
                toasts: state.toasts.filter((t) => t.id !== action.toastId),
            };
    }
};
const listeners = [];
let memoryState = { toasts: [] };
function dispatch(action) {
    memoryState = reducer(memoryState, action);
    listeners.forEach((listener) => {
        listener(memoryState);
    });
}
function toast({ ...props }) {
    const id = genId();
    const update = (props) => dispatch({
        type: actionTypes.UPDATE_TOAST,
        toast: { ...props, id },
    });
    const dismiss = () => dispatch({ type: actionTypes.DISMISS_TOAST, toastId: id });
    dispatch({
        type: actionTypes.ADD_TOAST,
        toast: {
            ...props,
            id,
            open: true,
            onOpenChange: (open) => {
                if (!open)
                    dismiss();
            },
        },
    });
    return {
        id,
        dismiss,
        update,
    };
}
function useToast() {
    const [state, setState] = React.useState(memoryState);
    React.useEffect(() => {
        listeners.push(setState);
        return () => {
            const index = listeners.indexOf(setState);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        };
    }, [state]);
    return {
        ...state,
        toast,
        dismiss: (toastId) => dispatch({ type: actionTypes.DISMISS_TOAST, toastId }),
        remove: (toastId) => dispatch({ type: actionTypes.REMOVE_TOAST, toastId }),
    };
}
export { useToast, toast };
