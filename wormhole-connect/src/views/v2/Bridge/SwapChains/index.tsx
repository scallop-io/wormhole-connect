import React from 'react';

import { useDispatch, useSelector } from 'react-redux';
import IconButton from '@mui/material/IconButton';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import { makeStyles } from 'tss-react/mui';

import config from 'config';
import { RootState } from 'store';
import { swapChains } from 'store/transferInput';
import { swapWallets } from 'store/wallet';

const useStyles = makeStyles()(() => ({
  swapButton: {
    display: 'block',
    position: 'absolute',
    bottom: -48,
    left: 'calc(50% - 20px)',
    width: 40,
    height: 40,
    zIndex: 1,
  },
}));

function SwapChains() {
  const dispatch = useDispatch();

  const { isTransactionInProgress, fromChain, toChain } = useSelector(
    (state: RootState) => state.transferInput,
  );

  const canSwap =
    fromChain &&
    !config.chains[fromChain]?.disabledAsDestination &&
    toChain &&
    !config.chains[toChain]?.disabledAsDestination;

  const swap = () => {
    if (!canSwap || isTransactionInProgress) return;
    dispatch(swapChains());
    dispatch(swapWallets());
  };

  const { classes } = useStyles();

  return (
    <IconButton
      className={classes.swapButton}
      onClick={swap}
      disabled={!canSwap}
    >
      <SwapVertIcon color="secondary" />
    </IconButton>
  );
}

export default SwapChains;
